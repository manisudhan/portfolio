(() => {
    const pages = document.querySelectorAll(".page");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 768px)");

    /* Split the big headings into letters so they can rise in one by one.
       The vertical heading on page 2 is left whole, it has its own effect. */
    document.querySelectorAll(".giant-heading:not(.vertical-upright-heading)").forEach((el) => {
        const text = el.textContent.trim();
        if (!text) return;

        el.setAttribute("aria-label", text);
        el.textContent = "";

        let index = 0;
        text.split(/(\s+)/).forEach((part) => {
            if (/^\s+$/.test(part)) {
                el.appendChild(document.createTextNode(" "));
                return;
            }
            const word = document.createElement("span");
            word.className = "word";
            word.setAttribute("aria-hidden", "true");
            [...part].forEach((ch) => {
                const c = document.createElement("span");
                c.className = "char";
                c.textContent = ch;
                c.style.setProperty("--ci", index++);
                word.appendChild(c);
            });
            el.appendChild(word);
        });

        el.style.setProperty("--cn", index);
        el.classList.add("is-split");
    });

    // Without IntersectionObserver, or with reduced motion, just show everything
    if (!pages.length || !("IntersectionObserver" in window) || reduced) {
        pages.forEach((p) => p.classList.add("is-visible"));
        return;
    }

    /* Each page is in one of three states:
         (none)       not on screen, content waiting
         is-visible   arrived, entrance animation plays
         is-leaving   moving away, content pops out */
    const SHOW_DESKTOP = 0.5;   // start the entrance once this much of the page is on screen
    const SHOW_MOBILE = 0.3;
    const LEAVE = 0.97;         // start the exit as soon as the page begins to move away
    const HIDE = 0.04;          // reset for the next visit once the page has almost fully left

    const previous = new WeakMap();
    const thresholds = Array.from({ length: 21 }, (_, i) => i / 20);

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const page = entry.target;
            const viewH = entry.rootBounds ? entry.rootBounds.height : window.innerHeight;
            const base = Math.min(entry.boundingClientRect.height || 1, viewH);
            const shown = entry.intersectionRect.height / base;

            const before = previous.get(page);
            previous.set(page, shown);
            const direction = before === undefined ? 0 : shown - before;

            const showAt = mobile.matches ? SHOW_MOBILE : SHOW_DESKTOP;
            const visible = page.classList.contains("is-visible");
            const leaving = page.classList.contains("is-leaving");

            // fully gone: reset
            if (shown <= HIDE) {
                page.classList.remove("is-visible", "is-leaving");
                return;
            }

            // arriving
            if (!visible && !leaving) {
                if (shown >= showAt && direction >= 0) page.classList.add("is-visible");
                return;
            }

            // arrived, now moving away (desktop only, phones scroll normally)
            if (visible) {
                if (!mobile.matches && direction < 0 && shown < LEAVE) {
                    page.classList.remove("is-visible");
                    page.classList.add("is-leaving");
                }
                return;
            }

            // scrolled back before it finished leaving: replay the entrance
            if (leaving && direction > 0 && shown >= showAt) {
                page.classList.remove("is-leaving");
                page.classList.add("is-visible");
            }
        });
    }, { threshold: thresholds });

    pages.forEach((p) => observer.observe(p));
})();