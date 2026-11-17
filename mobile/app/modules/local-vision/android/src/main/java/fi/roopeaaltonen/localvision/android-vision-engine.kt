package fi.roopeaaltonen.localvision

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ColorSpace
import android.os.SystemClock
import android.util.Base64
import androidx.exifinterface.media.ExifInterface
import ai.onnxruntime.OnnxTensor
import ai.onnxruntime.OrtEnvironment
import ai.onnxruntime.OrtSession
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.common.Barcode
import java.io.ByteArrayInputStream
import java.io.File
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.FloatBuffer
import java.security.MessageDigest
import java.time.Instant
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicReference
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.sqrt

internal class AndroidVisionFailure(val code: String): Exception(code)
internal class VisionJob(val id: String, val deadline: Long) {
  val cancelled=AtomicBoolean(false)
  val options=AtomicReference<OrtSession.RunOptions?>(null)
  fun cancel(){cancelled.set(true); options.get()?.let { try {it.setTerminate(true)} catch(_:Exception){} }}
  fun check(){if(cancelled.get())throw AndroidVisionFailure("CANCELLED");if(SystemClock.elapsedRealtime()>=deadline)throw AndroidVisionFailure("TIMEOUT")}
}

/** A single owned worker. Watchdog rejects once, but never releases ownership early. */
internal class AndroidVisionEngine(private val context: Context) {
  companion object {
    const val MODEL_SHA="d90cf29df7a26cd39d5c8d03c0b6c13179f03e8e905659111be3cbf54552984b"
    const val MODEL_BYTES=95661204L
    const val MODEL_ID="google-siglip2-base224-onnx-weight-int8-v1"
    const val PREPROCESSING="siglip2-android-bitmap-srgb-aa22-224-nchw-v1"
    val classes=listOf("cup","spoon","fork","knife","bottle","jar","can","carton","bag","battery","phone","textile","multiple-cups","spoon-and-fork","other")
  }
  private val current=AtomicReference<VisionJob?>(null)
  private val executor=Executors.newSingleThreadExecutor()
  private val timer=Executors.newSingleThreadScheduledExecutor()
  private val closed=AtomicBoolean(false)
  fun cancel(id: String){current.get()?.takeIf {it.id==id}?.cancel()}
  fun close(){closed.set(true);current.get()?.cancel();executor.shutdown();timer.shutdown()}
  fun submit(id: String,timeoutMs: Int,operation: (VisionJob)->String,deliver:(String?,String?)->Unit){
    if(closed.get() || !id.matches(Regex("^[a-fA-F0-9-]{36}$")) || timeoutMs !in 1..12000){deliver(null,"FAILED");return}
    val job=VisionJob(id,SystemClock.elapsedRealtime()+timeoutMs)
    if(!current.compareAndSet(null,job)){deliver(null,"BUSY");return}
    val delivered=AtomicBoolean(false)
    fun finish(value:String?,error:String?){if(delivered.compareAndSet(false,true))deliver(value,error)}
    val watchdog=timer.schedule({job.cancel();finish(null,"TIMEOUT")},timeoutMs.toLong(),TimeUnit.MILLISECONDS)
    executor.execute {
      try{job.check();val result=operation(job);job.check();finish(result,null)}
      catch(e:AndroidVisionFailure){finish(null,e.code)}
      catch(_:Exception){finish(null,"FAILED")}
      finally{watchdog.cancel(false);current.compareAndSet(job,null)}
    }
  }
  private fun sha(bytes: ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
  private fun modelFile(job:VisionJob):File {
    val target=File(context.cacheDir,"siglip-$MODEL_SHA.onnx")
    require(target.canonicalFile.parentFile==context.cacheDir.canonicalFile)
    fun checked(file:File):Boolean {
      if(!Files.isRegularFile(file.toPath(),LinkOption.NOFOLLOW_LINKS)||file.length()!=MODEL_BYTES)return false
      val hash=MessageDigest.getInstance("SHA-256")
      file.inputStream().use { input -> val block=ByteArray(65536);var n=input.read(block);while(n!=-1){job.check();hash.update(block,0,n);n=input.read(block)} }
      return hash.digest().joinToString(""){"%02x".format(it)}==MODEL_SHA
    }
    if(target.exists()){if(!checked(target))throw AndroidVisionFailure("UNAVAILABLE");return target}
    val temp=File.createTempFile("siglip-", ".tmp",context.cacheDir)
    try {
      var count=0L;val hash=MessageDigest.getInstance("SHA-256")
      context.assets.open("siglip/vision-int8.onnx").use { input -> temp.outputStream().use { output ->
        val block=ByteArray(65536);var n=input.read(block)
        while(n!=-1){job.check();count+=n;if(count>MODEL_BYTES)throw AndroidVisionFailure("UNAVAILABLE");hash.update(block,0,n);output.write(block,0,n);n=input.read(block)}
      }}
      require(count==MODEL_BYTES&&hash.digest().joinToString(""){"%02x".format(it)}==MODEL_SHA)
      require(temp.renameTo(target));return target
    }finally{if(temp.exists())require(temp.delete())}
  }
  private fun asset(name:String,maximum:Long,expected:String?=null):ByteArray {
    context.assets.open("siglip/$name").use { stream ->
      val result=java.io.ByteArrayOutputStream();val block=ByteArray(65536);var n=stream.read(block)
      while(n!=-1){if(result.size().toLong()+n>maximum)throw AndroidVisionFailure("UNAVAILABLE");result.write(block,0,n);n=stream.read(block)}
      val bytes=result.toByteArray();if(expected!=null && sha(bytes)!=expected)throw AndroidVisionFailure("UNAVAILABLE");return bytes
    }
  }
  fun ready(job:VisionJob):String {
    job.check();modelFile(job)
    val p=prototypes();require(p.length()==classes.size);job.check()
    return JSONObject().put("schemaVersion","local-vision-readiness-v1").put("status","primary_only").put("reason","android_local").put("evidence","integrity_and_interface_only").toString()
  }
  private fun prototypes():JSONArray {
    val bytes=asset("prototypes.json",500000,"eea5bfda99ff71d076657b7f81372270eb1f4bea96f2539a697abc0ea441df21")
    val parsed=JSONObject(String(bytes,Charsets.UTF_8));val names=parsed.getJSONArray("classes")
    require(names.length()==classes.size && classes.indices.all {names.getString(it)==classes[it]})
    val vectors=parsed.getJSONArray("vectors");require(vectors.length()==classes.size)
    for(i in classes.indices){val v=vectors.getJSONArray(i);require(v.length()==768);var norm=0.0;for(j in 0 until 768){val n=v.getDouble(j);require(n.isFinite());norm+=n*n};require(kotlin.math.abs(sqrt(norm)-1)<0.00001)}
    return vectors
  }
  private fun decode(base64:String):Pair<Bitmap,ByteArray> {
    if(base64.length !in 16..2_000_000 || !base64.matches(Regex("^[A-Za-z0-9+/]+={0,2}$")))throw AndroidVisionFailure("FAILED")
    val bytes=Base64.decode(base64,Base64.NO_WRAP);if(bytes.size>1_500_000 || bytes.size<4 || (bytes[0].toInt() and 255) != 255 || (bytes[1].toInt() and 255) != 216)throw AndroidVisionFailure("FAILED")
    val bounds=BitmapFactory.Options().apply {inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds)
    if(bounds.outWidth !in 1..4096 || bounds.outHeight !in 1..4096 || bounds.outWidth.toLong()*bounds.outHeight>8_000_000)throw AndroidVisionFailure("FAILED")
    val options=BitmapFactory.Options().apply {inPreferredConfig=Bitmap.Config.ARGB_8888;inPreferredColorSpace=ColorSpace.get(ColorSpace.Named.SRGB);inScaled=false}
    val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size,options)?:throw AndroidVisionFailure("FAILED")
    return bitmap to bytes
  }
  fun objects(base64:String,job:VisionJob):String {
    job.check();val (bitmap,bytes)=decode(base64)
    val tensor=try{
      val pixels=IntArray(bitmap.width*bitmap.height);bitmap.getPixels(pixels,0,bitmap.width,0,0,bitmap.width,bitmap.height)
      val orientation=SiglipPixels.exifOrientation(ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION,1))
      SiglipPixels.tensor(pixels,bitmap.width,bitmap.height,orientation)
    }finally{bitmap.recycle()}
    job.check();val model=modelFile(job);val prototypes=prototypes();job.check()
    val environment=OrtEnvironment.getEnvironment()
    val vector=OrtSession.SessionOptions().use { options ->
      options.setIntraOpNumThreads(2);options.setInterOpNumThreads(1)
      environment.createSession(model.absolutePath,options).use { session ->
        require(session.inputNames==setOf("pixel_values") && session.outputNames==setOf("embedding"));job.check()
        OnnxTensor.createTensor(environment,FloatBuffer.wrap(tensor),longArrayOf(1,3,224,224)).use { input ->
          OrtSession.RunOptions().use { run ->
            job.options.set(run)
            try{job.check();session.run(mapOf("pixel_values" to input),run).use { output ->
              val tensorOut=output[0] as OnnxTensor
              require(tensorOut.info.shape.contentEquals(longArrayOf(1,768)))
              val values=FloatArray(768);tensorOut.floatBuffer.get(values);values
            }}finally{job.options.set(null)}
          }
        }
      }
    }
    job.check();val norm=sqrt(vector.sumOf {it.toDouble()*it});require(norm.isFinite() && norm>0)
    val scores=JSONArray();for(i in classes.indices){var value=0.0;val p=prototypes.getJSONArray(i);for(j in 0 until 768)value+=vector[j]/norm*p.getDouble(j);require(value.isFinite());scores.put(JSONObject().put("kind",classes[i]).put("similarity",value.coerceIn(-1.0,1.0)))}
    return JSONObject().put("schemaVersion","siglip-object-candidates-v1").put("modelId",MODEL_ID).put("modelRevision","75de2d55ec2d0b4efc50b3e9ad70dba96a7b2fa2").put("preprocessing",PREPROCESSING).put("verification","unverified").put("confidence","uncalibrated").put("scope","object_form_only").put("checkedOn","2026-11-16").put("observedAt",Instant.ofEpochMilli(System.currentTimeMillis()).toString()).put("scores",scores).toString()
  }
  fun evidence(base64:String,job:VisionJob):String {
    job.check();val (bitmap,bytes)=decode(base64)
    val text=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    val scanner=BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_EAN_13,Barcode.FORMAT_EAN_8,Barcode.FORMAT_UPC_A,Barcode.FORMAT_ITF).build())
    try {
      val exif=SiglipPixels.exifOrientation(ExifInterface(ByteArrayInputStream(bytes)).getAttributeInt(ExifInterface.TAG_ORIENTATION,1))
      val degrees=when(exif){3->180;6->90;8->270;1->0;else->throw AndroidVisionFailure("FAILED")}
      val image=InputImage.fromBitmap(bitmap,degrees)
      // No early bitmap recycling: ownership stays until the native Task settles.
      val observed=Tasks.await(text.process(image));job.check()
      val marks=observed.textBlocks.flatMap {it.lines}.map {it.text.trim().uppercase(java.util.Locale.ROOT)}.filter {it.length<=64 && it.matches(Regex("^(?:[0-9]{1,3}\\s*)?(?:PET|HDPE|PVC|LDPE|PP|PS|PAP|FE|ALU|FOR|COT|TEX|GL)(?:\\s*[0-9]{1,3})?$"))}.distinct().take(24)
      val barcodes=Tasks.await(scanner.process(image));job.check()
      val codes=barcodes.mapNotNull {it.rawValue}.filter {it.matches(Regex("^[0-9]{8,14}$"))}.distinct().take(8)
      return JSONObject().put("schemaVersion","android-local-evidence-v1").put("engine","mlkit-bundled-latin-v1").put("observedAt",Instant.ofEpochMilli(System.currentTimeMillis()).toString()).put("width",bitmap.width).put("height",bitmap.height).put("codes",JSONArray(codes)).put("markings",JSONArray(marks)).toString()
    }finally{text.close();scanner.close();bitmap.recycle()}
  }
}
