// Proscenium arch installation (#835): a tall pointed arch band framing a
// stage field, flanked by two mirrored tapered columns that lean gently
// toward the opening. Proportions are deliberately exaggerated - the arch
// apex clears the column tops by half a stage height - so the silhouette
// reads as scenery in the preview window instead of at architectural scale.
// y grows downward (apex y=0, deck y=3), the convention every app surface
// renders. Index order follows the installer's walk: left column (deck rows
// climbing), stage (deck rows climbing), arch (three strands outer to inner,
// each walking left leg up, over the apex, right leg down), right column.
// At 1,000 pixels the index contract is an even 250 + 250 + 250 + 250.
function (pixelCount) {
  var count = Math.max(1, Math.floor(pixelCount) || 1)
  var columnCount = Math.floor(count / 4)
  var archCount = Math.floor(count / 4)
  var stageCount = count - 2 * columnCount - archCount
  var coords = []

  // Stage frame (y down: apex 0, deck 3; silhouette 5.1 x 3.0, ~1.7:1).
  var DECK = 3.0
  var CENTER = 2.55
  var SPRING = 2.425          // springing line both arch arcs rise from
  var OUTER_R = 2.8           // outer arc radius (equilateral: radius = span)
  var INNER_R = 2.5           // inner arc radius (band 0.3 thick)
  var LEFT_SPRING = 1.15      // outer left springing x
  var RIGHT_SPRING = 3.95     // outer right springing x
  var STAGE_GAP = 0.12        // clearance between the band and the stage field

  // Split n across weighted bins exactly (largest remainder).
  function apportion(n, weights) {
    var total = 0
    for (var i = 0; i < weights.length; i++) total += weights[i]
    var counts = []
    var remainders = []
    var placed = 0
    for (var j = 0; j < weights.length; j++) {
      var share = total > 0 ? n * weights[j] / total : n / weights.length
      var base = Math.floor(share)
      counts.push(base)
      remainders.push({ index: j, frac: share - base })
      placed += base
    }
    remainders.sort(function (a, b) { return b.frac - a.frac || a.index - b.index })
    for (var k = 0; k < n - placed; k++) counts[remainders[k % remainders.length].index]++
    return counts
  }

  // Fill horizontal rows exactly: rows are {y, x0, x1}, pixels apportioned by
  // row width and centred within each row so no region ends in a ragged edge.
  function fillRows(n, rows) {
    if (n < 1 || rows.length === 0) return
    var counts = apportion(n, rows.map(function (row) { return Math.max(row.x1 - row.x0, 0.001) }))
    for (var i = 0; i < rows.length; i++) {
      var rowCount = counts[i]
      for (var j = 0; j < rowCount; j++) {
        coords.push([
          rows[i].x0 + (rows[i].x1 - rows[i].x0) * (rowCount > 1 ? j / (rowCount - 1) : 0.5),
          rows[i].y,
        ])
      }
    }
  }

  // A tapered column as deck-to-top rows (wired climbing from the deck). The
  // top is narrower than the base and its centre leans toward the opening.
  function column(n, baseX0, baseX1, topX0, topX1, topY) {
    if (n < 1) return
    var height = DECK - topY
    var meanWidth = ((baseX1 - baseX0) + (topX1 - topX0)) / 2
    var rowCount = Math.max(1, Math.round(Math.sqrt(n * height / meanWidth)))
    var rows = []
    for (var row = 0; row < rowCount; row++) {
      var t = rowCount > 1 ? row / (rowCount - 1) : 0.5
      rows.push({
        y: DECK - 0.05 - (height - 0.1) * t,
        x0: baseX0 + (topX0 - baseX0) * t,
        x1: baseX1 + (topX1 - baseX1) * t,
      })
    }
    fillRows(n, rows)
  }

  // Half-width of the stage field at height y: the inner arch arcs pulled in
  // by the stage gap. Below the springing line the sides are the leg faces.
  function stageHalfWidth(y) {
    var radius = INNER_R - STAGE_GAP
    var dy = Math.max(0, SPRING - y)
    var reach = radius * radius - dy * dy
    if (reach <= 0) return 0
    return Math.sqrt(reach) - (RIGHT_SPRING - CENTER)
  }

  // One arch strand at radius r: leg up, arc to the apex, mirrored arc and
  // leg down. Points ride the centreline at even spacing along the path.
  function archStrand(n, r) {
    if (n < 1) return
    var legLength = DECK - SPRING
    var apexAngle = Math.acos((RIGHT_SPRING - CENTER) / r)
    var arcLength = r * apexAngle
    var total = 2 * legLength + 2 * arcLength
    for (var i = 0; i < n; i++) {
      var s = total * (i + 0.5) / n
      var x, y
      if (s < legLength) {
        x = RIGHT_SPRING - r
        y = DECK - s
      } else if (s < legLength + arcLength) {
        var phi = (s - legLength) / r
        x = RIGHT_SPRING - r * Math.cos(phi)
        y = SPRING - r * Math.sin(phi)
      } else if (s < legLength + 2 * arcLength) {
        var backPhi = (legLength + 2 * arcLength - s) / r
        x = LEFT_SPRING + r * Math.cos(backPhi)
        y = SPRING - r * Math.sin(backPhi)
      } else {
        x = LEFT_SPRING + r
        y = DECK - (total - s)
      }
      coords.push([x, y])
    }
  }

  // 1. Left column: exaggerated wedge, top leaning toward the arch.
  column(columnCount, 0, 0.75, 0.31, 0.73, 0.55)

  // 2. Stage field: deck rows climbing into the pointed opening.
  if (stageCount >= 1) {
    var stageTop = 0.62
    var stageBottom = DECK - 0.08
    var stageHeight = stageBottom - stageTop
    var stageRowCount = Math.max(1, Math.round(Math.sqrt(stageCount * stageHeight / (2 * stageHalfWidth(SPRING)))))
    var stageRows = []
    for (var stageRow = 0; stageRow < stageRowCount; stageRow++) {
      var stageT = stageRowCount > 1 ? stageRow / (stageRowCount - 1) : 0.5
      var stageY = stageBottom - stageHeight * stageT
      var half = stageHalfWidth(stageY)
      stageRows.push({ y: stageY, x0: CENTER - half, x1: CENTER + half })
    }
    fillRows(stageCount, stageRows)
  }

  // 3. Arch band: three strands outer to inner, one below 24 pixels so a
  //    degenerate count still walks a clean single line.
  if (archCount >= 24) {
    var strandCounts = apportion(archCount, [OUTER_R, (OUTER_R + INNER_R) / 2, INNER_R])
    archStrand(strandCounts[0], OUTER_R)
    archStrand(strandCounts[1], (OUTER_R + INNER_R) / 2)
    archStrand(strandCounts[2], INNER_R)
  } else {
    archStrand(archCount, (OUTER_R + INNER_R) / 2)
  }

  // 4. Right column: the left column mirrored about the stage centre.
  column(columnCount, 4.35, 5.1, 4.37, 4.79, 0.55)

  return coords
}
