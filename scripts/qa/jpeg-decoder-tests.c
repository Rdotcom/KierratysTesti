#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "turbojpeg.h"
#include "../../mobile/app/modules/local-vision/ios/jpeg-decoder.h"
static int checks = 0;
static void check(int value) { assert(value); checks++; }
int main(void) {
  unsigned char pixels[16 * 16 * 3], guarded[16 * 16 * 3 + 16];
  memset(pixels, 128, sizeof(pixels)); memset(guarded, 0xa5, sizeof(guarded));
  unsigned char *jpeg = NULL; size_t size = 0;
  tjhandle encoder = tj3Init(TJINIT_COMPRESS); check(encoder != NULL);
  check(tj3Set(encoder, TJPARAM_QUALITY, 90) == 0);
  check(tj3Set(encoder, TJPARAM_SUBSAMP, TJSAMP_444) == 0);
  check(tj3Compress8(encoder, pixels, 16, 0, 16, TJPF_RGB, &jpeg, &size) == 0);
  tj3Destroy(encoder);
  check(kig_jpeg_decode(jpeg, size, guarded + 8, sizeof(pixels), 16, 16) == 1);
  for (size_t i = 0; i < sizeof(pixels); i++) check(guarded[i + 8] == 128);
  check(kig_jpeg_decode(NULL, size, guarded + 8, sizeof(pixels), 16, 16) == 0);
  check(kig_jpeg_decode(jpeg, size, NULL, sizeof(pixels), 16, 16) == 0);
  check(kig_jpeg_decode(jpeg, 8000001, guarded + 8, sizeof(pixels), 16, 16) == 0);
  check(kig_jpeg_decode(jpeg, size, guarded + 8, sizeof(pixels) - 1, 16, 16) == 0);
  check(kig_jpeg_decode(jpeg, size, guarded + 8, sizeof(pixels), 0, 16) == 0);
  check(kig_jpeg_decode(jpeg, size, guarded + 8, sizeof(pixels), 4097, 16) == 0);
  check(kig_jpeg_decode(jpeg, size, guarded + 8, sizeof(pixels), 4096, 4096) == 0);
  check(kig_jpeg_decode(jpeg, size, guarded + 8, sizeof(pixels), 15, 16) == 0);
  for (size_t n = 0; n < size; n++)
    check(kig_jpeg_decode(jpeg, n, guarded + 8, sizeof(pixels), 16, 16) == 0);
  unsigned state = 12648430;
  for (int iteration = 0; iteration < 500; iteration++) {
    unsigned char malformed[2048];
    for (size_t i = 0; i < sizeof(malformed); i++) { state = state * 1664525u + 1013904223u; malformed[i] = state >> 24; }
    malformed[0] = 255; malformed[1] = 216;
    check(kig_jpeg_decode(malformed, sizeof(malformed), guarded + 8, sizeof(pixels), 16, 16) == 0);
  }
  for (int i = 0; i < 8; i++) { check(guarded[i] == 0xa5); check(guarded[sizeof(guarded) - 1 - i] == 0xa5); }
  tj3Free(jpeg);
  printf("{\"checks\":%d,\"randomMalformedInputs\":500,\"predictions\":0}\n", checks);
  return 0;
}
