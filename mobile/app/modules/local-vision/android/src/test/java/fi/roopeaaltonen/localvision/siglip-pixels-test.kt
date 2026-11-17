package fi.roopeaaltonen.localvision

import org.junit.Assert.*
import org.junit.Test

class SiglipPixelsTest {
  @Test fun metadataStrippedJpegHasNormalOrientation(){
    assertEquals(1,SiglipPixels.exifOrientation(0))
    for(value in 1..9)assertEquals(value,SiglipPixels.exifOrientation(value))
  }
  @Test fun fixedRgbNormalizationAndOrientations(){
    val rgb=intArrayOf(0xff000000.toInt(),0xffffffff.toInt(),0xff808080.toInt(),0xffff0000.toInt())
    for(orientation in 1..8){
      val values=SiglipPixels.tensor(rgb,2,2,orientation)
      assertEquals(150528,values.size)
      assertTrue(values.all {it.isFinite()&&it in -1f..1f})
      assertTrue(values.any {it == -1f});assertTrue(values.any {it==1f})
    }
    val black=SiglipPixels.tensor(intArrayOf(0xff000000.toInt()),1,1)
    assertTrue(black.all {it == -1f})
    assertTrue(SiglipPixels.tensor(intArrayOf(0xffffffff.toInt()),1,1).all {it == 1f})
  }
  @Test fun rejectsTransparentOversizedAndInvalidOrientation(){
    for(operation in listOf<()->Unit>(
      {SiglipPixels.tensor(intArrayOf(0x00ffffff),1,1)},
      {SiglipPixels.tensor(intArrayOf(0xff000000.toInt()),4097,1)},
      {SiglipPixels.tensor(intArrayOf(0xff000000.toInt()),1,1,9)},
    )){try{operation();fail("invalid tensor accepted")}catch(_:IllegalArgumentException){}}
  }
}
