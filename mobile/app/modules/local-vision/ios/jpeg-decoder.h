#ifndef KIERRATYS_JPEG_DECODER_H
#define KIERRATYS_JPEG_DECODER_H
#include <stddef.h>
#include <stdint.h>
/* Own bounded adapter to pinned libjpeg-turbo3.2.1, not a new JPEG algorithm. */
int kig_jpeg_decode(const uint8_t *source, size_t length, uint8_t *rgb,
                    size_t capacity, int width, int height);
#endif
