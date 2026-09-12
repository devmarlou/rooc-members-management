export function auctionPageNavigation(pages, requestedPage, query = "") {
  const normalizedQuery = query.trim().toLowerCase();
  const matchingPages = normalizedQuery
    ? pages.filter((page) => page.slots.some((slot) => String(slot.member?.char_name || "").toLowerCase().includes(normalizedQuery)))
    : pages;
  const currentPage = matchingPages.find((page) => page.page === requestedPage) || matchingPages[0] || null;
  const index = matchingPages.indexOf(currentPage);
  return {
    searching: Boolean(normalizedQuery),
    matchingPages,
    currentPage,
    previousPage: matchingPages[index - 1]?.page ?? null,
    nextPage: matchingPages[index + 1]?.page ?? null
  };
}
