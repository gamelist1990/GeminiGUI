const s = "<script>alert('x')</script>\nline2";
const esc = s
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/\"/g, '&quot;')
  .replace(/'/g, '&#39;')
  .replace(/`/g, '&#96;');
console.log(esc.replace(/\n/g, '<br>'));
