package fi.roopeaaltonen.localvision

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min

/** Independent port of the reviewed Pillow-AA22 convention. No material inference. */
internal object SiglipPixels {
  const val SIDE = 224
  // EXIF0 means unspecified, including metadata-stripped camera JPEGs.
  fun exifOrientation(value: Int): Int = if(value == 0) 1 else value
  private data class Kernel(val first: Int, val weights: IntArray)
  private fun kernels(input: Int): List<Kernel> {
    val scale = input.toDouble() / SIDE
    val support = max(1.0, scale)
    return (0 until SIDE).map { out ->
      val center = (out + 0.5) * scale
      val first = max(0, (center - support + 0.5).toInt())
      val last = min(input, (center + support + 0.5).toInt())
      val weights = (first until last).map { max(0.0, 1 - abs((it - center + 0.5) / support)) }
      val total = weights.sum()
      require(total > 0)
      Kernel(first, weights.map { (0.5 + it / total * (1 shl 22)).toInt() }.toIntArray())
    }
  }
  fun tensor(argb: IntArray, width: Int, height: Int, orientation: Int = 1): FloatArray {
    require(width in 1..4096 && height in 1..4096 && width.toLong()*height <= 8_000_000 && argb.size == width*height && orientation in 1..8)
    require(argb.all { (it ushr 24) == 255 })
    val swapped = orientation >= 5
    val w = if(swapped) height else width
    val h = if(swapped) width else height
    val xs=kernels(w); val ys=kernels(h)
    val horizontal=ByteArray(SIDE*h*3)
    fun pixel(x: Int,y: Int): Int {
      val index=when(orientation){
        1 -> y*width+x
        2 -> y*width+width-1-x
        3 -> (height-1-y)*width+width-1-x
        4 -> (height-1-y)*width+x
        5 -> x*width+y
        6 -> (height-1-x)*width+y
        7 -> (height-1-x)*width+width-1-y
        else -> x*width+width-1-y
      }
      return argb[index]
    }
    for(y in 0 until h) for(x in 0 until SIDE){
      var r=1L shl 21;var g=1L shl 21;var b=1L shl 21
      xs[x].weights.forEachIndexed { i,weight ->
        val p=pixel(xs[x].first+i,y)
        r+=((p ushr 16) and 255).toLong()*weight
        g+=((p ushr 8) and 255).toLong()*weight
        b+=(p and 255).toLong()*weight
      }
      val offset=(y*SIDE+x)*3
      horizontal[offset]=(r shr 22).coerceIn(0,255).toByte()
      horizontal[offset+1]=(g shr 22).coerceIn(0,255).toByte()
      horizontal[offset+2]=(b shr 22).coerceIn(0,255).toByte()
    }
    return FloatArray(3*SIDE*SIDE).also { result ->
      for(y in 0 until SIDE) for(x in 0 until SIDE) for(c in 0..2){
        var sum=1L shl 21
        ys[y].weights.forEachIndexed { i,weight -> sum += (horizontal[((ys[y].first+i)*SIDE+x)*3+c].toInt() and 255).toLong()*weight }
        val p=(sum shr 22).coerceIn(0,255)
        result[c*SIDE*SIDE+y*SIDE+x]=((p.toDouble()/255).toFloat()-0.5f)/0.5f
      }
    }
  }
}
