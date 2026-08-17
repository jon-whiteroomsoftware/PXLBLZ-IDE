import WebSocket from 'ws'
const mode = process.argv[2] === 'on'
const ws = new WebSocket('ws://192.168.8.224:81')
ws.on('open', () => {
  ws.send(JSON.stringify(mode ? { sequencerMode: 1, runSequencer: true } : { sequencerMode: 0, runSequencer: false }))
  setTimeout(() => { ws.send(JSON.stringify({ getConfig: true })) }, 400)
})
ws.on('message', (d) => { if (typeof d !== 'string' && d[0] !== 123) return; const m = JSON.parse(d.toString()); if ('sequencerMode' in m) { console.log('sequencerMode', m.sequencerMode, 'runSequencer', m.runSequencer, 'active', m.activeProgram?.activeProgramId); ws.close(); process.exit(0) } })
setTimeout(() => { console.log('timeout'); process.exit(1) }, 6000)
