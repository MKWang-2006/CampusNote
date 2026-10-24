// Keep the selected filter visible after navigation without moving focus or the page.
const feedTabs = document.querySelector('.discover-feed .tabs');
const selectedFilter = feedTabs?.querySelector('[aria-current="page"]');
if (selectedFilter) {
  const selectedBounds = selectedFilter.getBoundingClientRect();
  const stripBounds = feedTabs.getBoundingClientRect();
  if (selectedBounds.left < stripBounds.left) {
    feedTabs.scrollLeft -= stripBounds.left - selectedBounds.left;
  } else if (selectedBounds.right > stripBounds.right) {
    feedTabs.scrollLeft += selectedBounds.right - stripBounds.right;
  }
}
