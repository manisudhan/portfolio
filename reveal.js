(() => {
    const pages = document.querySelectorAll(".page");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia("(max-width: 768px)");

    /* Headings are no longer split into letters: the whole slide moves as one
       block now, so there is nothing for per-character animation to do. */

    /* ------------------------------------------------------------------
       THE PROJECT ROW

       The row holds more cards than fit, so it carries a second copy of the
       whole set and creeps sideways for ever: once it has travelled the width
       of one set, the scroll position jumps back by exactly that much, which
       lands on an identical frame, so the first card follows the last with no
       seam. It stops while the pointer is over it, while anything inside has
       keyboard focus, and while a card is open.

       Opening a card centres it and remembers where the row was; closing it
       puts the row back exactly where it was and the drift carries on.
       ------------------------------------------------------------------ */
    const SPEED = 40;                                   // pixels per second
    const canLoop = !reduced && matchMedia("(hover: hover)").matches;
    const wide = matchMedia("(min-width: 1201px)");

    document.querySelectorAll(".projects-container").forEach((row) => {
        const page = row.closest(".page");
        const originals = [...row.querySelectorAll(".project-card")];
        if (!originals.length) return;

        let setWidth = 0;        // width of one full set of cards
        let paused = false;
        let savedScroll = null;
        let last = 0;

        /* A second copy of every card. It is hidden from assistive tech and
           taken out of the tab order, so the duplicates are decoration only. */
        function addClones() {
            if (row.querySelector("[data-clone]")) return;
            originals.forEach((card) => {
                const copy = card.cloneNode(true);
                copy.dataset.clone = "1";
                copy.setAttribute("aria-hidden", "true");
                copy.querySelectorAll("a, button").forEach((el) => { el.tabIndex = -1; });
                row.appendChild(copy);
            });
        }

        function dropClones() {
            row.querySelectorAll("[data-clone]").forEach((el) => el.remove());
            row.scrollLeft = 0;
        }

        // stacked on narrow screens: one copy only, and no drift
        function syncClones() {
            if (canLoop && wide.matches) addClones();
            else dropClones();
            setWidth = 0;
        }

        function measure() {
            const firstClone = row.querySelector("[data-clone]");
            setWidth = firstClone ? firstClone.offsetLeft - originals[0].offsetLeft : 0;
        }

        const hold = () => { paused = true; };
        const release = () => { paused = false; };

        row.addEventListener("pointerenter", hold);
        row.addEventListener("pointerleave", release);
        row.addEventListener("focusin", hold);
        row.addEventListener("focusout", release);

        function frame(now) {
            requestAnimationFrame(frame);

            const dt = last ? Math.min((now - last) / 1000, 0.05) : 0;
            last = now;

            if (!setWidth) measure();
            if (!setWidth || paused || row.classList.contains("has-expanded")) return;
            if (page && !page.classList.contains("is-visible")) return;

            let next = row.scrollLeft + SPEED * dt;
            if (next >= setWidth) next -= setWidth;    // round to the start again
            row.scrollLeft = next;
        }

        syncClones();
        wide.addEventListener("change", syncClones);
        window.addEventListener("resize", () => { setWidth = 0; }, { passive: true });
        if (canLoop) requestAnimationFrame(frame);

        /* Used by the toggle below */
        row.projectRow = {
            remember() { savedScroll = row.scrollLeft; },
            restore() {
                if (savedScroll === null) return;
                row.scrollTo({ left: savedScroll, behavior: "smooth" });
                savedScroll = null;
            },
            centre(card) {
                let done = false;
                const run = () => {
                    if (done) return;
                    done = true;
                    const rowBox = row.getBoundingClientRect();
                    const cardBox = card.getBoundingClientRect();
                    const offset = (cardBox.left + cardBox.width / 2)
                                 - (rowBox.left + rowBox.width / 2);
                    row.scrollTo({ left: row.scrollLeft + offset, behavior: "smooth" });
                };
                // centre once the card has finished growing, so the maths uses
                // its final width rather than the width it is passing through
                card.addEventListener("transitionend", function once(event) {
                    if (event.propertyName !== "flex-basis") return;
                    card.removeEventListener("transitionend", once);
                    run();
                });
                setTimeout(run, 650);
            }
        };
    });

    /* Called from the arrow button on every card, clones included. */
    window.toggleStackDemo = function (button) {
        const card = button.closest(".project-card");
        const row = card.closest(".projects-container");
        if (!card || !row) return;

        const opening = !card.classList.contains("expanded");
        const api = row.projectRow;

        if (opening && api) api.remember();

        row.querySelectorAll(".project-card").forEach((other) => {
            const open = other === card && opening;
            other.classList.toggle("expanded", open);
            const btn = other.querySelector(".side-dropdown-btn");
            if (btn) btn.setAttribute("aria-expanded", String(open));
        });

        row.classList.toggle("has-expanded", opening);

        if (!api) return;
        if (opening) api.centre(card);
        else api.restore();
    };

    // Without IntersectionObserver, or with reduced motion, just show everything
    if (!pages.length || !("IntersectionObserver" in window) || reduced) {
        pages.forEach((p) => p.classList.add("is-visible"));
        return;
    }

    /* A page is in one of three states:
         (none)       off screen, its content waiting
         is-visible   on screen, entrance plays
         is-leaving   on its way out, content pops out

       The state is decided by how much of the page is on screen and nothing
       else. The earlier version also compared against the previous reading to
       work out the scroll direction, which went wrong whenever two readings
       arrived in the same frame -- during a snap, a jump to an anchor, or a
       fast flick -- and left a page stuck with its content hidden. */
    const SHOW = 0.45;   // this much on screen: play the entrance
    const GONE = 0.06;   // this little left: reset, ready for the next visit

    const thresholds = [0, 0.06, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            const page = entry.target;

            // how much of the page is showing, measured against whichever is
            // smaller: the page itself or the viewport
            const viewH = entry.rootBounds ? entry.rootBounds.height : window.innerHeight;
            const base = Math.min(entry.boundingClientRect.height || 1, viewH);
            const shown = entry.intersectionRect.height / base;

            if (shown >= SHOW) {
                page.classList.remove("is-leaving");
                page.classList.add("is-visible");
            } else if (shown <= GONE) {
                page.classList.remove("is-visible", "is-leaving");
            } else if (page.classList.contains("is-visible") && !mobile.matches) {
                // part way out on a desktop: let it pop out on the way
                page.classList.remove("is-visible");
                page.classList.add("is-leaving");
            }
        });
    }, { threshold: thresholds });

    pages.forEach((p) => observer.observe(p));

    /* Safety net: whatever is on screen once everything has settled must be
       showing its content, even if a resize or a restored scroll position meant
       the observer never saw it cross a threshold. */
    function rescue() {
        const viewH = window.innerHeight;
        pages.forEach((page) => {
            const box = page.getBoundingClientRect();
            const onScreen = Math.min(box.bottom, viewH) - Math.max(box.top, 0);
            const base = Math.min(box.height || 1, viewH);
            if (onScreen / base >= SHOW) {
                page.classList.remove("is-leaving");
                page.classList.add("is-visible");
            }
        });
    }

    window.addEventListener("load", rescue);
    window.addEventListener("resize", rescue, { passive: true });
    setTimeout(rescue, 600);
})();