// V2a: bring the selected item of a sideways-scrolling row (role tabs,
// Settings sections on phones) into view, horizontally only, so the page
// itself never jumps. Nothing happens when the row does not overflow.
export const centerSelectedInRow = (row, selector = '.on') => {
  const item = row?.querySelector(selector);
  if (!item || row.scrollWidth <= row.clientWidth) return;
  const rowBox = row.getBoundingClientRect();
  const itemBox = item.getBoundingClientRect();
  row.scrollLeft += (itemBox.left + itemBox.width / 2) - (rowBox.left + rowBox.width / 2);
};
