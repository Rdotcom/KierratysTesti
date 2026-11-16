#include "jpeg-decoder.h"
#if __has_include("turbojpeg.h")
#include "turbojpeg.h"
int kig_jpeg_decode(const uint8_t *source, size_t length, uint8_t *rgb,
                    size_t capacity, int width, int height) {
  if (!source || !rgb || !length || length > 8000000 || width < 1 || height < 1 ||
      width > 4096 || height > 4096 || (size_t)width * height > 8000000 ||
      capacity != (size_t)width * height * 3) return 0;
  tjhandle decoder = tj3Init(TJINIT_DECOMPRESS);
  if (!decoder) return 0;
  int ok = 0;
  /* Bound progressive buffers, pixel work, scan count; warnings fail closed.
     Explicit accurate integer IDCT/smooth upsampling; build disables SIMD. */
  if (tj3Set(decoder, TJPARAM_STOPONWARNING, 1) ||
      tj3Set(decoder, TJPARAM_MAXMEMORY, 32) ||
      tj3Set(decoder, TJPARAM_MAXPIXELS, 8000000) ||
      tj3Set(decoder, TJPARAM_SCANLIMIT, 100) ||
      tj3Set(decoder, TJPARAM_FASTDCT, 0) ||
      tj3Set(decoder, TJPARAM_FASTUPSAMPLE, 0) ||
      tj3Set(decoder, TJPARAM_SAVEMARKERS, 0) ||
      tj3DecompressHeader(decoder, source, length)) goto done;
  int color = tj3Get(decoder, TJPARAM_COLORSPACE);
  if (tj3Get(decoder, TJPARAM_JPEGWIDTH) != width ||
      tj3Get(decoder, TJPARAM_JPEGHEIGHT) != height ||
      tj3Get(decoder, TJPARAM_PRECISION) != 8 ||
      (color != TJCS_RGB && color != TJCS_YCbCr && color != TJCS_GRAY)) goto done;
  ok = tj3Decompress8(decoder, source, length, rgb, width * 3, TJPF_RGB) == 0;
done:
  tj3Destroy(decoder);
  return ok;
}
#else
int kig_jpeg_decode(const uint8_t *source, size_t length, uint8_t *rgb,
                    size_t capacity, int width, int height) { return 0; }
#endif
