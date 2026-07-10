// Escape user-entered text before inserting it into HTML or quoted attributes.
export const escHtml=s=>String(s).replace(/[&<>"']/g, c=>(
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
