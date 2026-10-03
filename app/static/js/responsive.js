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

        const navActions = nav.querySelector(
            ".store-actions, .nav-actions, .admin-nav-right, .staff-nav-actions"
        );
        if (!navActions) return;

        let button = nav.querySelector(".nav-hamburger");

        // Fallback for pages without a hamburger in their HTML
        if (!button) {
            button = document.createElement("button");
            button.type = "button";
            button.className = "nav-hamburger";
            button.setAttribute("aria-label", "Open menu");
            button.setAttribute("aria-expanded", "false");
            button.innerHTML = "<span></span><span></span><span></span>";
            nav.insertBefore(button, navActions);
        }

        // Avoid double-binding
        if (button.dataset.bound === "1") return;
        button.dataset.bound = "1";

        function setOpen(open) {
            navActions.classList.toggle("open", open);
            button.classList.toggle("active", open);
            button.setAttribute("aria-expanded", String(open));
            button.setAttribute("aria-label", open ? "Close menu" : "Open menu");
        }

        button.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(!navActions.classList.contains("open"));
        });

        // Close after choosing an item
        navActions.addEventListener("click", function (event) {
            if (event.target.closest("a, button, input, select")) {
                setTimeout(function () { setOpen(false); }, 80);
            }
        });

        // Close when tapping outside
        document.addEventListener("click", function (event) {
            if (!nav.contains(event.target)) setOpen(false);
        });

        // Close with Escape
        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") setOpen(false);
        });

        // Reset on desktop width
        window.addEventListener("resize", function () {
            if (window.innerWidth > 900) setOpen(false);
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

    window.showUiModal = showUiModal;
    window.closeUiModal = closeUiModal;

})();
