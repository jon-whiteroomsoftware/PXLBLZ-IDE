/* global array, pixelCount, floor, random, rgb */
var levels = array(pixelCount)

export function beforeRender() {
  for (var i = 0; i < pixelCount; i++) levels[i] *= 0.875
  levels[floor(random(pixelCount))] = 1
}

export function render(index) {
  rgb(levels[index], levels[index], levels[index])
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Pixelblaze 2D entry signature.
export function render2D(index, x, y) {
  render(index)
}
