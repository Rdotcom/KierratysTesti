package fi.roopeaaltonen.localvision

import android.os.Bundle
import android.os.SystemClock
import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.json.JSONObject
import org.json.JSONArray
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import kotlin.math.abs

@RunWith(AndroidJUnit4::class)
class LocalVisionInstrumentedTest {
  private val instrumentation=InstrumentationRegistry.getInstrumentation()
  private fun fixture(name:String)=instrumentation.context.assets.open("parity/$name").use {it.readBytes()}
  private fun run(engine:AndroidVisionEngine,operation:(VisionJob)->String):String {
    val latch=CountDownLatch(1);var result:String?=null;var error:String?=null;var diagnostic:Exception?=null
    // Test fixtures only: retain the actual cause in JUnit, never add production photo logging.
    engine.submit(UUID.randomUUID().toString(),12000,{job->try{operation(job)}catch(e:Exception){diagnostic=e;throw e}}){value,code->result=value;error=code;latch.countDown()}
    assertTrue("native deadline",latch.await(15,TimeUnit.SECONDS));assertNull("native failure:$error; ${diagnostic?.stackTraceToString()}",error)
    return result?:throw AssertionError("missing observation")
  }
  @Test fun actualJpegScoresAndOfflineMarkings(){
    val engine=AndroidVisionEngine(instrumentation.targetContext)
    val expected=JSONObject(String(fixture("expected.json"),Charsets.UTF_8));val rows=expected.getJSONArray("rows");val receipts=JSONArray()
    try{
      val ready=JSONObject(run(engine){engine.ready(it)});assertEquals("android_local",ready.getString("reason"))
      for(i in 0 until rows.length()){
        val row=rows.getJSONObject(i);val jpeg=Base64.encodeToString(fixture(row.getString("file")),Base64.NO_WRAP)
        val started=SystemClock.elapsedRealtime()
        val result=JSONObject(run(engine){engine.objects(jpeg,it)});val scores=result.getJSONArray("scores");val reference=row.getJSONArray("scores")
        var maximum=0.0;var winner=0
        for(j in 0 until scores.length()){
          maximum=maxOf(maximum,abs(scores.getJSONObject(j).getDouble("similarity")-reference.getDouble(j)))
          if(scores.getJSONObject(j).getDouble("similarity")>scores.getJSONObject(winner).getDouble("similarity"))winner=j
        }
        val top=scores.getJSONObject(winner).getString("kind")
        val receipt=JSONObject().put("id",row.getString("id")).put("top1",top).put("maxScoreError",maximum).put("elapsedMs",SystemClock.elapsedRealtime()-started)
        receipts.put(receipt)
        instrumentation.sendStatus(0,Bundle().apply{putString("kigAndroidImage",receipt.toString())})
        assertEquals(row.getString("id"),row.getString("top1"),top)
        assertTrue("unchanged0.005score gate:$maximum",maximum<=expected.getDouble("maximumScoreError"))
      }
      val text=JSONObject(run(engine){engine.evidence(Base64.encodeToString(fixture("synthetic-pap21.jpg"),Base64.NO_WRAP),it)})
      assertTrue(text.getJSONArray("markings").toString(),text.getJSONArray("markings").toString().contains("PAP 21"))
      val code=JSONObject(run(engine){engine.evidence(Base64.encodeToString(fixture("synthetic-gtin.jpg"),Base64.NO_WRAP),it)})
      assertTrue(code.getJSONArray("codes").toString(),code.getJSONArray("codes").toString().contains("6408430030309"))
      instrumentation.sendStatus(0,Bundle().apply {putString("kigAndroidEvidence",JSONObject().put("jpegCases",receipts).put("materialMarking",true).put("gtinDecoded",true).put("hardware","Android ARM64 emulator, not Samsung").toString())})
    }finally{engine.close()}
  }
}
