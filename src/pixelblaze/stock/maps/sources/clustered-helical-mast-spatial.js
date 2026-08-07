// Measured 12 V WS2811 mast: 52 addressable pixels drive 156 physical emitters,
// with three 20 mm-spaced emitters sharing each pixel. The strip climbs
// clockwise around a 22 mm-diameter mast with 20 mm of axial pitch per turn.
// One map point represents the middle emitter in each three-emitter group; the
// other two cannot receive independent coordinates or colours from the
// controller.
function(pixelCount) {
  var diameter = 22
  var turnPitch = 20
  var emitterSpacing = 20
  var emittersPerPixel = 3
  var radius = diameter / 2
  var circumference = Math.PI * diameter
  var travelPerTurn = Math.sqrt(
    circumference * circumference + turnPitch * turnPitch
  )
  var emittersPerTurn = travelPerTurn / emitterSpacing
  var anglePerEmitter = 2 * Math.PI / emittersPerTurn
  var risePerEmitter = turnPitch / emittersPerTurn
  var coords = []

  for (var i = 0; i < pixelCount; i++) {
    var middleEmitter = i * emittersPerPixel + 1
    var angle = middleEmitter * anglePerEmitter
    coords.push([
      radius + radius * Math.cos(angle),
      middleEmitter * risePerEmitter,
      radius - radius * Math.sin(angle),
    ])
  }
  return coords
}
