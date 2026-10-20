// stdin: [{"fn":"judge","args":[...]}...] → stdout: JSON 결과 배열 (pytest가 호출)
const C = require('../js/core.js');
let s = ''; process.stdin.on('data', (d) => (s += d)).on('end', () => {
  const calls = JSON.parse(s);
  console.log(JSON.stringify(calls.map((c) => C[c.fn](...c.args))));
});
