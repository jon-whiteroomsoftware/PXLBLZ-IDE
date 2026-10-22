// After Hours FOOD sign (#1196): letters F, O, O, D in a single-stroke tube font,
// a border of bulbs, and an arrow of three shaft segments and a head.
// Index order: F 0-49, O 50-109, O 110-169, D 170-236, border 237-377
// (141 bulbs), arrow shaft 378-425 (3 x 16), head 426-441, at 442 pixels.
// Other counts re-solve the pitch and keep the order.
function (pixelCount) {
  var count = Math.max(1, Math.floor(pixelCount) || 1)
  var w = 0.7, h = 1, gap = 0.25
  var wordW = 4 * w + 3 * gap
  var shaftY = h + 0.5
  var shaft = 0.6 * wordW
  var a = shaft / 3
  var c = (a / 2) / Math.SQRT2
  var x0 = (wordW - (shaft + c)) / 2
  var coords = []

  // Keep straight vertices exact; densely sample curves before measuring and
  // resampling their arc length. The same table owns length and placement.
  function path(start, closed) {
    return { points: [start], lengths: [0], length: 0, closed: closed }
  }
  function line(p, x, y) {
    var last = p.points[p.points.length - 1]
    p.length += Math.hypot(x - last[0], y - last[1])
    p.points.push([x, y])
    p.lengths.push(p.length)
  }
  function arc(p, cx, cy, rx, ry, from, to) {
    for (var i = 1; i <= 2000; i++) {
      var t = from + (to - from) * i / 2000
      line(p, cx + rx * Math.sin(t), cy - ry * Math.cos(t))
    }
  }
  function emit(p, n) {
    var segment = 1
    for (var i = 0; i < n; i++) {
      var target = (i + (p.closed ? 0 : 0.5)) * p.length / n
      while (segment < p.points.length - 1 && p.lengths[segment] < target) segment++
      var lo = p.points[segment - 1], hi = p.points[segment]
      var fraction = (target - p.lengths[segment - 1]) / (p.lengths[segment] - p.lengths[segment - 1])
      coords.push([lo[0] + (hi[0] - lo[0]) * fraction, lo[1] + (hi[1] - lo[1]) * fraction])
    }
  }

  var f1 = path([w, 0], false)
  line(f1, 0, 0)
  line(f1, 0, h)
  var f2 = path([0, h / 2], false)
  line(f2, 0.8 * w, h / 2)
  var letters = [f1, f2]
  for (var letter = 1; letter <= 2; letter++) {
    var cx = letter * (w + gap) + w / 2
    var o = path([cx, 0], true)
    arc(o, cx, h / 2, w / 2, h / 2, 0, 2 * Math.PI)
    letters.push(o)
  }
  var offset = 3 * (w + gap), s = 0.4 * w
  var d = path([offset, h], true)
  line(d, offset, 0)
  line(d, offset + s, 0)
  arc(d, offset + s, h / 2, w - s, h / 2, 0, Math.PI)
  line(d, offset, h)
  letters.push(d)

  var r = 0.15, left = -0.3, right = wordW + 0.3
  var top = -0.3, bottom = shaftY + c + 0.3
  var border = path([left + r, top], true)
  line(border, right - r, top)
  arc(border, right - r, top + r, r, r, 0, Math.PI / 2)
  line(border, right, bottom - r)
  arc(border, right - r, bottom - r, r, r, Math.PI / 2, Math.PI)
  line(border, left + r, bottom)
  arc(border, left + r, bottom - r, r, r, Math.PI, 3 * Math.PI / 2)
  line(border, left, top + r)
  arc(border, left + r, top + r, r, r, 3 * Math.PI / 2, 2 * Math.PI)

  var L = 4 * a
  for (var i = 0; i < letters.length; i++) L += letters[i].length
  var B = 0
  for (var b = 150; b >= 0; b -= 3) {
    if (b <= count / 2 && (b === 0 || border.length / b >= 2 * L / (count - b))) {
      B = b
      break
    }
  }
  var M = count - B
  var pitch = L / M
  var k = Math.min(Math.round(a / pitch), Math.floor(M / 4))
  var letterCount = M - 4 * k
  var letterLength = L - 4 * a
  var shares = letters.map(function (p, index) {
    var exact = letterCount * p.length / letterLength
    return { index: index, count: Math.floor(exact), remainder: exact - Math.floor(exact) }
  })
  var remaining = letterCount
  for (var i = 0; i < shares.length; i++) remaining -= shares[i].count
  var ranked = shares.slice().sort(function (u, v) { return v.remainder - u.remainder || u.index - v.index })
  for (var i = 0; i < remaining; i++) ranked[i].count++
  for (var i = 0; i < letters.length; i++) emit(letters[i], shares[i].count)
  emit(border, B)
  for (var j = 0; j < 3; j++) {
    var segment = path([x0 + j * a, shaftY], false)
    line(segment, x0 + (j + 1) * a, shaftY)
    emit(segment, k)
  }
  var head = path([x0 + shaft, shaftY - c], false)
  line(head, x0 + shaft + c, shaftY)
  line(head, x0 + shaft, shaftY + c)
  emit(head, k)
  return coords
}
