// Loaded with defer after KaTeX and its auto-render helper.
window.__renderBlogMath = function () {
  var root = document.querySelector(".blog-shell");
  if (!root || typeof renderMathInElement !== "function") {
    return;
  }
  renderMathInElement(root, {
    delimiters: [
      { left: "$$", right: "$$", display: true },
      { left: "$", right: "$", display: false }
    ],
    throwOnError: false
  });
};

(async function () {
  var tocList = document.getElementById("toc-list");
  var tocRoot = document.querySelector(".toc");
  var mobileTocToggle = document.querySelector(".mobile-toc-toggle");
  var articleRoot = document.getElementById("article-root");
  var blogShell = document.querySelector(".blog-shell");
  var tocEntries = [];
  var tocExpandableItems = [];
  var tocActiveMarker = null;
  var tocMarkerItem = null;
  var activeTocEntry = null;
  var tocSpyFrame = null;
  function revealPage() {
    if (blogShell) {
      blogShell.classList.add("is-ready");
    }
  }

  function enableMobileFootnoteToggles() {
    var mobileFootnotes = window.matchMedia("(max-width: 1220px)");
    var mobileNoteCount = 0;

    function getLocalNote(footnoteRef) {
      var localNoteId = footnoteRef.getAttribute("data-mobile-note-id");
      return localNoteId ? document.getElementById(localNoteId) : null;
    }

    function createLocalNote(footnoteRef, sourceNoteItem) {
      mobileNoteCount += 1;
      var localNote = document.createElement("span");
      localNote.className = "sidenote mobile-sidenote";
      localNote.id = "mobile-sidenote-" + mobileNoteCount;
      localNote.setAttribute("role", "note");
      localNote.setAttribute("data-note-id", sourceNoteItem.id);

      var localNoteItem = sourceNoteItem.cloneNode(true);
      localNoteItem.removeAttribute("id");
      localNote.appendChild(localNoteItem);
      footnoteRef.parentNode.insertBefore(localNote, footnoteRef.nextSibling);
      footnoteRef.setAttribute("data-mobile-note-id", localNote.id);
      return localNote;
    }

    function updateRefAccessibility(footnoteRef) {
      if (!mobileFootnotes.matches) {
        footnoteRef.removeAttribute("aria-controls");
        footnoteRef.removeAttribute("aria-expanded");
        return;
      }

      var localNote = getLocalNote(footnoteRef);
      if (localNote) {
        footnoteRef.setAttribute("aria-controls", localNote.id);
      } else {
        footnoteRef.removeAttribute("aria-controls");
      }
      footnoteRef.setAttribute(
        "aria-expanded",
        String(Boolean(localNote && localNote.classList.contains("is-open")))
      );
    }

    function syncFootnoteAccessibility() {
      var footnoteRefs = articleRoot.querySelectorAll(".footnote-ref[href^='#note-']");
      for (var i = 0; i < footnoteRefs.length; i += 1) {
        updateRefAccessibility(footnoteRefs[i]);
      }
    }

    syncFootnoteAccessibility();
    mobileFootnotes.addEventListener("change", syncFootnoteAccessibility);

    articleRoot.addEventListener("click", function (event) {
      var footnoteRef = event.target.closest(".footnote-ref[href^='#note-']");
      if (!footnoteRef || !mobileFootnotes.matches) {
        return;
      }

      var noteId = footnoteRef.getAttribute("href").slice(1);
      var sourceNoteItem = document.getElementById(noteId);
      if (!sourceNoteItem) {
        return;
      }

      event.preventDefault();
      var localNote = getLocalNote(footnoteRef) || createLocalNote(footnoteRef, sourceNoteItem);
      var willOpen = !localNote.classList.contains("is-open");
      localNote.classList.toggle("is-open", willOpen);
      updateRefAccessibility(footnoteRef);
    });
  }

  // Consecutive sections that read as one chapter share a single top-level
  // entry and become its children. The umbrella links to its first member.
  var TOC_SECTION_GROUPS = [];
  articleRoot.querySelectorAll(":scope > section[data-toc-group]").forEach(function (section) {
    var title = section.getAttribute("data-toc-group");
    var group = TOC_SECTION_GROUPS.find(function (item) { return item.title === title; });
    if (!group) {
      group = { title: title, sectionIds: [] };
      TOC_SECTION_GROUPS.push(group);
    }
    group.sectionIds.push(section.id);
  });

  function buildToc() {
    var groupBySectionId = {};
    for (var g = 0; g < TOC_SECTION_GROUPS.length; g += 1) {
      var group = TOC_SECTION_GROUPS[g];
      group.sublist = null;
      for (var s = 0; s < group.sectionIds.length; s += 1) {
        groupBySectionId[group.sectionIds[s]] = group;
      }
    }

    function createTocItem(targetId, label, isDeepest) {
      var item = document.createElement("li");
      item.className = "toc-item" + (isDeepest ? " toc-level-3" : "");
      var link = document.createElement("a");
      link.href = "#" + targetId;
      link.textContent = label;
      item.appendChild(link);
      return item;
    }

    function createSublist(item) {
      var sublist = document.createElement("ul");
      sublist.className = "toc-sublist";
      item.appendChild(sublist);
      return sublist;
    }

    function sectionHeadingOf(section) {
      return section.querySelector(":scope > h2, :scope > details > summary h2");
    }

    function tocLabelForHeading(heading) {
      var shortLabel = (heading.getAttribute("data-toc-label") || "").trim();
      if (shortLabel) return shortLabel;
      var label = heading.textContent.trim();
      var tag = heading.querySelector("code");
      if (tag) {
        label = label.slice(0, label.lastIndexOf(tag.textContent)).trim();
      }
      return label;
    }

    var sections = articleRoot.querySelectorAll(":scope > section");
    for (var i = 0; i < sections.length; i += 1) {
      var section = sections[i];
      var sectionHeading = sectionHeadingOf(section);
      if (!sectionHeading || sectionHeading.getAttribute("data-toc-hidden") === "true") {
        continue;
      }
      var subheadings = section.querySelectorAll("h3[id]");
      var sectionGroup = groupBySectionId[section.id];
      var j;

      if (sectionGroup) {
        if (!sectionGroup.sublist) {
          var groupItem = createTocItem(section.id, sectionGroup.title, false);
          tocList.appendChild(groupItem);
          sectionGroup.sublist = createSublist(groupItem);
        }
        sectionGroup.sublist.appendChild(
          createTocItem(section.id, tocLabelForHeading(sectionHeading), false)
        );
        for (j = 0; j < subheadings.length; j += 1) {
          sectionGroup.sublist.appendChild(
            createTocItem(subheadings[j].id, tocLabelForHeading(subheadings[j]), true)
          );
        }
        continue;
      }

      var item = createTocItem(
        section.id,
        tocLabelForHeading(sectionHeading),
        false
      );
      if (subheadings.length > 0) {
        var sublist = createSublist(item);
        for (j = 0; j < subheadings.length; j += 1) {
          sublist.appendChild(
            createTocItem(
              subheadings[j].id,
              tocLabelForHeading(subheadings[j]),
              false
            )
          );
        }
      }
      tocList.appendChild(item);
    }

    setupTocExpanders();
    setupTocSpy();
  }

  function setMobileTocOpen(open) {
    if (!tocRoot || !mobileTocToggle) {
      return;
    }
    open = open && window.matchMedia("(max-width: 1220px)").matches;
    tocRoot.classList.toggle("is-mobile-open", open);
    document.body.classList.toggle("menu-open", open);
    mobileTocToggle.setAttribute("aria-expanded", open ? "true" : "false");
    mobileTocToggle.setAttribute(
      "aria-label",
      (open ? "Close" : "Open") + " table of contents"
    );
    if (open) {
      var firstLink = tocList.querySelector("a[href^='#']");
      if (firstLink) {
        window.requestAnimationFrame(function () {
          firstLink.focus();
        });
      }
    }
  }

  function setupMobileToc() {
    if (!tocRoot || !mobileTocToggle) {
      return;
    }
    mobileTocToggle.addEventListener("click", function () {
      setMobileTocOpen(mobileTocToggle.getAttribute("aria-expanded") !== "true");
    });
    tocList.addEventListener("click", function (event) {
      if (event.target.closest("a[href^='#']") && window.matchMedia("(max-width: 1220px)").matches) {
        setMobileTocOpen(false);
      }
    });
    tocRoot.addEventListener("click", function (event) {
      if (event.target === tocRoot) {
        setMobileTocOpen(false);
        mobileTocToggle.focus();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && mobileTocToggle.getAttribute("aria-expanded") === "true") {
        setMobileTocOpen(false);
        mobileTocToggle.focus();
      }
    });
    window.matchMedia("(max-width: 1220px)").addEventListener("change", function (event) {
      if (!event.matches) {
        setMobileTocOpen(false);
      }
    });
    setMobileTocOpen(false);
  }

  function tocChildOfType(item, matches) {
    for (var i = 0; i < item.children.length; i += 1) {
      if (matches(item.children[i])) {
        return item.children[i];
      }
    }
    return null;
  }

  function tocSublistOf(item) {
    return tocChildOfType(item, function (child) {
      return child.classList.contains("toc-sublist");
    });
  }

  function tocLinkOf(item) {
    return tocChildOfType(item, function (child) {
      return child.tagName === "A";
    });
  }

  function tocExpanderOf(item) {
    return tocChildOfType(item, function (child) {
      return child.classList.contains("toc-expander");
    });
  }

  function measureTocSublist(item) {
    var sublist = tocSublistOf(item);
    if (sublist) {
      sublist.style.setProperty("--toc-child-height", sublist.scrollHeight + "px");
    }
  }

  function measureTocSublists() {
    for (var i = 0; i < tocExpandableItems.length; i += 1) {
      measureTocSublist(tocExpandableItems[i]);
    }
  }

  function setTocItemExpanded(item, expanded) {
    var sublist = tocSublistOf(item);
    var expander = tocExpanderOf(item);
    if (!sublist || !expander) {
      return;
    }

    // A collapsed sublist is only visually hidden, so its links must also be
    // taken out of the tab order and the accessibility tree.
    measureTocSublist(item);
    item.classList.toggle("is-expanded", expanded);
    sublist.setAttribute("aria-hidden", expanded ? "false" : "true");
    var links = sublist.querySelectorAll("a");
    for (var i = 0; i < links.length; i += 1) {
      if (expanded) {
        links[i].removeAttribute("tabindex");
      } else {
        links[i].setAttribute("tabindex", "-1");
      }
    }

    var link = tocLinkOf(item);
    expander.setAttribute("aria-expanded", expanded ? "true" : "false");
    expander.setAttribute(
      "aria-label",
      (expanded ? "Collapse" : "Expand") +
        " subsections for " +
        (link ? link.textContent : "section")
    );
  }

  function setupTocExpanders() {
    for (var i = 0; i < tocList.children.length; i += 1) {
      var item = tocList.children[i];
      var sublist = tocSublistOf(item);
      var link = tocLinkOf(item);
      if (!sublist || !link) {
        continue;
      }

      sublist.id = "toc-children-" + i;
      item.classList.add("has-children");

      var expander = document.createElement("button");
      expander.type = "button";
      expander.className = "toc-expander";
      expander.setAttribute("aria-controls", sublist.id);
      var icon = document.createElement("span");
      icon.className = "toc-expander-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "›";
      expander.appendChild(icon);
      item.insertBefore(expander, link);

      tocExpandableItems.push(item);
      setTocItemExpanded(item, false);
    }

    tocList.addEventListener("click", function (event) {
      var expander = event.target.closest(".toc-expander");
      if (!expander || !tocList.contains(expander)) {
        return;
      }
      event.preventDefault();
      var item = expander.closest(".toc-item");
      if (!item) {
        return;
      }
      setTocItemExpanded(item, expander.getAttribute("aria-expanded") !== "true");
      // Keep the focus ring for keyboard activation (detail === 0) only.
      if (event.detail > 0) {
        expander.blur();
      }
      scheduleTocSpy();
    });
  }

  function setupTocSpy() {
    if (!tocRoot) {
      return;
    }

    tocActiveMarker = document.createElement("span");
    tocActiveMarker.className = "toc-active-marker";
    tocActiveMarker.setAttribute("aria-hidden", "true");
    tocRoot.appendChild(tocActiveMarker);

    var links = tocList.querySelectorAll("a[href^='#']");
    for (var i = 0; i < links.length; i += 1) {
      var targetId = links[i].getAttribute("href").slice(1);
      try {
        targetId = decodeURIComponent(targetId);
      } catch (error) {
        // A malformed escape means the href is not a usable id; keep it raw.
      }
      var target = document.getElementById(targetId);
      if (!target) {
        continue;
      }
      tocEntries.push({
        link: links[i],
        item: links[i].closest(".toc-item"),
        target: target,
      });
    }

    window.addEventListener("scroll", scheduleTocSpy, { passive: true });
    tocRoot.addEventListener("scroll", scheduleTocSpy, { passive: true });
    scheduleTocSpy();
  }

  function scheduleTocSpy() {
    if (tocSpyFrame !== null) {
      return;
    }
    tocSpyFrame = window.requestAnimationFrame(function () {
      tocSpyFrame = null;
      updateTocSpy();
    });
  }

  // Headings inside a closed disclosure have no layout box, so they cannot
  // be the section the reader is currently looking at.
  function currentTocEntry() {
    var candidates = [];
    for (var i = 0; i < tocEntries.length; i += 1) {
      if (tocEntries[i].target.offsetParent !== null) {
        candidates.push(tocEntries[i]);
      }
    }
    if (candidates.length === 0) {
      return null;
    }

    var documentHeight = Math.max(
      document.body ? document.body.scrollHeight : 0,
      document.documentElement ? document.documentElement.scrollHeight : 0
    );
    if (window.pageYOffset + window.innerHeight >= documentHeight - 2) {
      return candidates[candidates.length - 1];
    }

    var threshold = window.pageYOffset + 24;
    var active = candidates[0];
    for (var j = 0; j < candidates.length; j += 1) {
      var top = candidates[j].target.getBoundingClientRect().top + window.pageYOffset;
      if (top <= threshold) {
        active = candidates[j];
      }
    }
    return active;
  }

  // The marker cannot sit on a link the reader cannot see, so a hidden entry
  // hands the marker to the collapsed parent that stands in for it.
  function tocMarkerEntry(entry) {
    if (!entry || !entry.item) {
      return entry;
    }
    var hiddenList = entry.item.closest(".toc-sublist[aria-hidden='true']");
    if (!hiddenList || !tocList.contains(hiddenList)) {
      return entry;
    }
    var parentItem = hiddenList.parentElement
      ? hiddenList.parentElement.closest(".toc-item")
      : null;
    var parentLink = parentItem ? tocLinkOf(parentItem) : null;
    if (!parentLink) {
      return entry;
    }
    return { link: parentLink, item: parentItem, target: entry.target };
  }

  function positionTocMarker(entry) {
    if (tocMarkerItem) {
      tocMarkerItem.classList.remove("is-marker-target");
      tocMarkerItem = null;
    }
    if (!entry || !entry.link || !tocActiveMarker) {
      tocRoot.classList.remove("has-active-marker");
      return;
    }

    var linkRect = entry.link.getBoundingClientRect();
    var tocRect = tocRoot.getBoundingClientRect();
    var markerY = linkRect.top - tocRect.top + tocRoot.scrollTop + linkRect.height / 2;
    tocActiveMarker.style.setProperty("--toc-active-marker-y", markerY + "px");
    tocRoot.classList.add("has-active-marker");

    if (entry.item) {
      entry.item.classList.add("is-marker-target");
      tocMarkerItem = entry.item;
    }
  }

  function clearTocActive() {
    for (var i = 0; i < tocEntries.length; i += 1) {
      tocEntries[i].link.classList.remove("is-active");
      tocEntries[i].link.removeAttribute("aria-current");
      if (tocEntries[i].item) {
        tocEntries[i].item.classList.remove("has-active-descendant");
      }
    }
    activeTocEntry = null;
  }

  function markTocAncestors(item) {
    var parent = item && item.parentElement ? item.parentElement.closest(".toc-item") : null;
    while (parent) {
      parent.classList.add("has-active-descendant");
      parent = parent.parentElement ? parent.parentElement.closest(".toc-item") : null;
    }
  }

  function updateTocSpy() {
    if (!tocRoot || tocEntries.length === 0) {
      return;
    }
    if (window.matchMedia("(max-width: 1220px)").matches) {
      clearTocActive();
      positionTocMarker(null);
      return;
    }

    var entry = currentTocEntry();
    if (entry !== activeTocEntry) {
      clearTocActive();
      activeTocEntry = entry;
      if (entry) {
        entry.link.classList.add("is-active");
        entry.link.setAttribute("aria-current", "location");
        markTocAncestors(entry.item);
      }
    }
    positionTocMarker(tocMarkerEntry(entry));
  }

  function openDisclosureForTarget(targetId) {
    if (!targetId) {
      return;
    }
    var target = document.getElementById(targetId);
    var disclosure = target
      ? target.closest("details") || target.querySelector(":scope > details")
      : null;
    if (disclosure) {
      disclosure.open = true;
    }
  }

  function alignTocWithFirstParagraph() {
    var toc = tocRoot;
    if (!toc) {
      return;
    }

    if (window.matchMedia("(max-width: 1220px)").matches) {
      toc.style.marginTop = "0px";
      return;
    }

    var firstParagraph = articleRoot.querySelector("#overview p") || articleRoot.querySelector("section p");
    var firstTocLink = toc.querySelector("a");
    if (!firstParagraph || !firstTocLink) {
      toc.style.marginTop = "0px";
      return;
    }

    var previousPosition = toc.style.position;
    var previousTop = toc.style.top;
    toc.style.marginTop = "0px";
    toc.style.position = "static";
    toc.style.top = "auto";

    var tocLinkDocumentTop =
      firstTocLink.getBoundingClientRect().top + window.scrollY;
    var paragraphDocumentTop = firstParagraph.getBoundingClientRect().top + window.scrollY;
    var offset = paragraphDocumentTop - tocLinkDocumentTop;

    toc.style.position = previousPosition;
    toc.style.top = previousTop;
    toc.style.marginTop = Math.max(0, Math.round(offset)) + "px";
  }

  function refreshPageLayout() {
    alignTocWithFirstParagraph();
    measureTocSublists();
    scheduleTocSpy();
  }

  function enableImageZoom() {
    var figures = articleRoot.querySelectorAll(".text-width-image");
    if (!figures || figures.length === 0) {
      return;
    }

    function closeAllZoomed() {
      for (var i = 0; i < figures.length; i += 1) {
        figures[i].classList.remove("is-zoomed");
      }
    }

    for (var i = 0; i < figures.length; i += 1) {
      (function (figure) {
        var image = figure.querySelector("img");
        if (!image) {
          return;
        }
        image.addEventListener("click", function (event) {
          event.preventDefault();
          var willOpen = !figure.classList.contains("is-zoomed");
          closeAllZoomed();
          if (willOpen) {
            figure.classList.add("is-zoomed");
          }
        });
      })(figures[i]);
    }

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeAllZoomed();
      }
    });
  }

  function waitForInitialLayout() {
    if (!document.fonts || !document.fonts.ready) {
      return Promise.resolve();
    }
    return Promise.race([
      document.fonts.ready,
      new Promise(function (resolve) {
        setTimeout(resolve, 1200);
      }),
    ]);
  }

  enableMobileFootnoteToggles();
  // The table of contents resolves each entry to its heading element, so it
  // has to be built once the article is in the document.
  buildToc();
  setupMobileToc();
  openDisclosureForTarget(window.location.hash.slice(1));
  tocList.addEventListener("click", function (event) {
    var link = event.target.closest("a[href^='#']");
    if (link) {
      openDisclosureForTarget(link.getAttribute("href").slice(1));
    }
  });
  window.addEventListener("hashchange", function () {
    openDisclosureForTarget(window.location.hash.slice(1));
  });
  enableImageZoom();
  if (window.__renderBlogMath) {
    window.__renderBlogMath();
  }
  await waitForInitialLayout();
  refreshPageLayout();
  revealPage();
  window.addEventListener("load", refreshPageLayout);
  window.addEventListener("resize", refreshPageLayout);
  document.addEventListener("toggle", function (event) {
    if (event.target && event.target.matches("details")) {
      scheduleTocSpy();
    }
  }, true);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(refreshPageLayout);
  }
})();
