// Unwrapped cylindrical coordinate view of the measured 52-pixel / 156-emitter
// clustered helical mast. X is clockwise distance around the 22 mm mast; Y is
// physical height. Each map point represents the middle emitter in one
// three-emitter WS2811 group.
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
    var clockwiseAngle = middleEmitter * anglePerEmitter
    var wrappedAngle = clockwiseAngle % (2 * Math.PI)
    coords.push([
      wrappedAngle * radius,
      middleEmitter * risePerEmitter,
    ])
  }
  return coords
}
