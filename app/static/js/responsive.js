/* =========================================================
   CHAND ENTERPRISES - RESPONSIVE JS (FINAL)
   Save as: app/static/responsive.js  (replace whole file)
   ========================================================= */

(function () {
    "use strict";

    /* =====================================================
       HAMBURGER MENU
       ===================================================== */

    function setupMobileMenu() {

        const nav = document.querySelector(".nav");
        if (!nav) return;

        /* =================================================
           Chand Enterprises custom side menu
           ================================================= */
        const sideMenu = document.getElementById("ceMobileMenu");
        const backdrop = document.getElementById("ceMenuBackdrop");
        const closeButton = document.getElementById("ceMenuClose");
        const hamburger = nav.querySelector(".nav-hamburger");

        if (sideMenu && backdrop && hamburger) {

            if (hamburger.dataset.ceBound !== "1") {
                hamburger.dataset.ceBound = "1";

                function setSideMenu(open) {
                    sideMenu.classList.toggle("open", open);
                    backdrop.classList.toggle("open", open);
                    document.body.classList.toggle("ce-menu-open", open);

                    sideMenu.setAttribute("aria-hidden", String(!open));
                    backdrop.setAttribute("aria-hidden", String(!open));
                    hamburger.classList.toggle("active", open);
                    hamburger.setAttribute("aria-expanded", String(open));
                    hamburger.setAttribute(
                        "aria-label",
                        open ? "Close menu" : "Open menu"
                    );
                }

                hamburger.addEventListener("click", function (event) {
                    event.preventDefault();
                    event.stopPropagation();
                    setSideMenu(!sideMenu.classList.contains("open"));
                });

                if (closeButton) {
                    closeButton.addEventListener("click", function () {
                        setSideMenu(false);
                    });
                }

                backdrop.addEventListener("click", function () {
                    setSideMenu(false);
                });

                sideMenu.addEventListener("click", function (event) {
                    const link = event.target.closest("a");
                    if (link) setSideMenu(false);
                });

                document.addEventListener("keydown", function (event) {
                    if (event.key === "Escape") setSideMenu(false);
                });

                window.closeMobileMenu = function () {
                    setSideMenu(false);
                };
            }

            return;
        }

        /* =================================================
           Legacy staff/admin navigation fallback
           ================================================= */
        const navActions = nav.querySelector(
            ".store-actions, .nav-actions, .admin-nav-right, .staff-nav-actions"
        );
        if (!navActions || !hamburger) return;

        if (hamburger.dataset.legacyBound === "1") return;
        hamburger.dataset.legacyBound = "1";

        function setOpen(open) {
            navActions.classList.toggle("open", open);
            hamburger.classList.toggle("active", open);
            hamburger.setAttribute("aria-expanded", String(open));
            hamburger.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        }

        hamburger.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(!navActions.classList.contains("open"));
        });

        navActions.addEventListener("click", function (event) {
            if (event.target.closest("a, button, input, select")) {
                setTimeout(function () { setOpen(false); }, 80);
            }
        });

        document.addEventListener("click", function (event) {
            if (!nav.contains(event.target)) setOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") setOpen(false);
        });
    }

    /* =====================================================
       UI MODAL (separate from app.js #modal)
       ===================================================== */

    function createUiModal() {

        let modal = document.getElementById("ui-modal");
        if (modal) return modal;

        modal = document.createElement("div");
        modal.id = "ui-modal";
        modal.innerHTML =
            '<div class="ui-modal-box">' +
                '<div class="ui-modal-title"></div>' +
                '<div class="ui-modal-message"></div>' +
                '<div class="ui-modal-actions">' +
                    '<button type="button" class="ui-modal-close">Close</button>' +
                "</div>" +
            "</div>";

        modal.style.display = "none";
        document.body.appendChild(modal);

        modal.querySelector(".ui-modal-close")
            .addEventListener("click", closeUiModal);

        modal.addEventListener("click", function (event) {
            if (event.target === modal) closeUiModal();
        });

        return modal;
    }

    function showUiModal(title, message, buttonText) {
        const modal = createUiModal();

        modal.querySelector(".ui-modal-title").textContent = title || "";
        modal.querySelector(".ui-modal-message").textContent = message || "";
        modal.querySelector(".ui-modal-close").textContent = buttonText || "Close";

        modal.style.display = "flex";
        document.body.style.overflow = "hidden";
    }

    function closeUiModal() {
        const modal = document.getElementById("ui-modal");
        if (!modal) return;

        modal.style.display = "none";
        document.body.style.overflow = "";
    }

    document.addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;

        const modal = document.getElementById("ui-modal");
        if (modal && modal.style.display !== "none") closeUiModal();
    });

    /* =====================================================
       WELCOME MODAL (home page, once per session)
       ===================================================== */

    function showWelcome() {

        if (window.location.pathname !== "/" && window.location.pathname !== "") {
            return;
        }

        try {
            if (sessionStorage.getItem("ce_welcome_seen")) return;
            sessionStorage.setItem("ce_welcome_seen", "1");
        } catch (error) {
            return;
        }

        setTimeout(function () {
            showUiModal(
                "Welcome to Chand Enterprises",
                "Order drinks, premium water and local delivery from one place.",
                "Start Shopping"
            );
        }, 600);
    }

    /* =====================================================
       LIGHT / DARK THEME
       ===================================================== */

    function applyTheme(theme) {

        document.documentElement.setAttribute("data-theme", theme);

        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) {
            meta.setAttribute("content", theme === "dark" ? "#0b141d" : "#ffffff");
        }

        const toggle = document.getElementById("themeToggle");
        if (toggle) {
            const icon = toggle.querySelector(".theme-icon");
            if (icon) icon.textContent = theme === "dark" ? "\u2600\uFE0F" : "\uD83C\uDF19";

            toggle.setAttribute(
                "aria-label",
                theme === "dark" ? "Switch to light theme" : "Switch to dark theme"
            );
            toggle.title = theme === "dark" ? "Light theme" : "Dark theme";
        }
    }

    function toggleTheme() {

        const current =
            document.documentElement.getAttribute("data-theme") === "dark"
                ? "dark"
                : "light";

        const next = current === "dark" ? "light" : "dark";

        applyTheme(next);

        try {
            localStorage.setItem("ce_theme", next);
        } catch (error) {
            /* private mode: theme still changes for this visit */
        }
    }

    function setupTheme() {

        const toggle = document.getElementById("themeToggle");
        if (!toggle || toggle.dataset.bound === "1") return;

        toggle.dataset.bound = "1";
        toggle.addEventListener("click", toggleTheme);

        applyTheme(
            document.documentElement.getAttribute("data-theme") === "dark"
                ? "dark"
                : "light"
        );
    }

    /* =====================================================
       MOBILE VIEWPORT HEIGHT
       ===================================================== */

    function setViewportHeight() {
        const height = window.visualViewport
            ? window.visualViewport.height
            : window.innerHeight;

        document.documentElement.style.setProperty(
            "--viewport-height",
            height + "px"
        );
    }

    /* =====================================================
       INIT
       ===================================================== */

    function init() {
        setupTheme();
        setupMobileMenu();
        setViewportHeight();
        showWelcome();
    }

    window.addEventListener("resize", setViewportHeight);

    if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", setViewportHeight);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    window.toggleTheme = toggleTheme;
    window.showUiModal = showUiModal;
    window.closeUiModal = closeUiModal;

})();
