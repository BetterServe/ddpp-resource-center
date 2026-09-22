const lum = h => { const c=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255)
  .map(v=>v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)); return .2126*c[0]+.7152*c[1]+.0722*c[2]; };
const ratio=(a,b)=>{const [x,y]=[lum(a),lum(b)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
const on=[['#FFFFFF','white card'],['#EBE9E3','cream page']];
console.log('current --dark-gray #858380');
on.forEach(([bg,n])=>console.log('  on',n,ratio('#858380',bg).toFixed(2)));
console.log('\ncandidates (need >=4.5 for body text):');
['#6E6C68','#6B6965','#67655F','#63615C','#5F5D58'].forEach(c=>
  console.log(' ',c, on.map(([bg,n])=>n+' '+ratio(c,bg).toFixed(2)).join('   ')));
console.log('\nalso check existing text colors:');
console.log('  #3C5555 on white ', ratio('#3C5555','#FFFFFF').toFixed(2));
console.log('  #3C5555 on cream ', ratio('#3C5555','#EBE9E3').toFixed(2));
console.log('  --med-green #1B6B6B on white', ratio('#1B6B6B','#FFFFFF').toFixed(2));
console.log('  --med-gray #B8B6B1 on green #1B3939 (tally asof)', ratio('#B8B6B1','#1B3939').toFixed(2));
