/* =========================================================
   CHAND ENTERPRISES
   RESPONSIVE JS
   ========================================================= */

(function () {

    "use strict";


    /* =====================================================
       HAMBURGER MENU
       ===================================================== */

   function setupMobileMenu() {

    "use strict";


    /* =================================================
       FIND NAVIGATION
       ================================================= */

    const nav =
        document.querySelector(".nav");

    if (!nav) {
        return;
    }


    /* =================================================
       FIND NAVIGATION ACTIONS
       ================================================= */

    const navActions =
        nav.querySelector(
            ".nav-actions, " +
            ".store-actions, " +
            ".admin-nav-right, " +
            ".staff-nav-actions"
        );

    if (!navActions) {
        return;
    }


    /* =================================================
       COMMON RESPONSIVE CLASS
       ================================================= */

    navActions.classList.add(
        "nav-actions"
    );


    /* =================================================
       FIND EXISTING HAMBURGER
       ================================================= */

    let button =
        nav.querySelector(
            ".nav-hamburger"
        );


    /* =================================================
       FALLBACK FOR OTHER PAGES
       ================================================= */

    if (!button) {

        button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "nav-hamburger";

        button.setAttribute(
            "aria-label",
            "Open menu"
        );

        button.setAttribute(
            "aria-expanded",
            "false"
        );

        button.innerHTML = `
            <span></span>
            <span></span>
            <span></span>
        `;

        nav.insertBefore(
            button,
            navActions
        );
    }


    /* =================================================
       CLOSE MENU
       ================================================= */

    function closeMenu() {

        navActions.classList.remove(
            "open"
        );

        button.classList.remove(
            "active"
        );

        button.setAttribute(
            "aria-expanded",
            "false"
        );

        button.setAttribute(
            "aria-label",
            "Open menu"
        );
    }


    /* =================================================
       TOGGLE MENU
       ================================================= */

    function toggleMenu() {

        const isOpen =
            navActions.classList.toggle(
                "open"
            );

        button.classList.toggle(
            "active",
            isOpen
        );

        button.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

        button.setAttribute(
            "aria-label",
            isOpen
                ? "Close menu"
                : "Open menu"
        );
    }


    /* =================================================
       HAMBURGER CLICK
       ================================================= */

    button.addEventListener(
        "click",
        function (event) {

            event.preventDefault();

            event.stopPropagation();

            toggleMenu();

        }
    );


    /* =================================================
       MENU CLICK
       ================================================= */

    navActions.addEventListener(
        "click",
        function (event) {

            const action =
                event.target.closest(
                    "a, button, input, select"
                );

            if (action) {

                setTimeout(
                    closeMenu,
                    80
                );

            }

        }
    );


    /* =================================================
       CLICK OUTSIDE
       ================================================= */

    document.addEventListener(
        "click",
        function (event) {

            if (
                !nav.contains(
                    event.target
                )
            ) {

                closeMenu();

            }

        }
    );


    /* =================================================
       ESCAPE KEY
       ================================================= */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key === "Escape"
            ) {

                closeMenu();

            }

        }
    );


    /* =================================================
       DESKTOP RESET
       ================================================= */

    window.addEventListener(
        "resize",
        function () {

            if (
                window.innerWidth > 900
            ) {

                closeMenu();

            }

        }
    );

}


    /* =====================================================
       SIMPLE UI MODAL

       Separate from app.js #modal.
       This prevents conflicts with cart / checkout.
       ===================================================== */

    function createUiModal() {

        let modal =
            document.getElementById(
                "ui-modal"
            );


        if (modal) {

            return modal;

        }


        modal =
            document.createElement(
                "div"
            );


        modal.id =
            "ui-modal";


        modal.innerHTML = `

            <div class="ui-modal-box">

                <div
                    class="ui-modal-title"
                ></div>


                <div
                    class="ui-modal-message"
                ></div>


                <div
                    class="ui-modal-actions"
                >

                    <button
                        type="button"
                        class="ui-modal-close"
                    >
                        Close
                    </button>

                </div>

            </div>

        `;


        modal.style.display =
            "none";


        document.body.appendChild(
            modal
        );


        const closeButton =
            modal.querySelector(
                ".ui-modal-close"
            );


        closeButton.addEventListener(
            "click",
            closeUiModal
        );


        /* Click outside modal */

        modal.addEventListener(
            "click",
            function (event) {

                if (
                    event.target ===
                    modal
                ) {

                    closeUiModal();

                }

            }
        );


        return modal;

    }


    /* =====================================================
       SHOW MODAL
       ===================================================== */

    function showUiModal(
        title,
        message,
        buttonText = "Close"
    ) {

        const modal =
            createUiModal();


        const titleElement =
            modal.querySelector(
                ".ui-modal-title"
            );


        const messageElement =
            modal.querySelector(
                ".ui-modal-message"
            );


        const closeButton =
            modal.querySelector(
                ".ui-modal-close"
            );


        titleElement.textContent =
            title || "";


        messageElement.textContent =
            message || "";


        closeButton.textContent =
            buttonText || "Close";


        modal.style.display =
            "flex";


        document.body.style.overflow =
            "hidden";

    }


    /* =====================================================
       CLOSE MODAL
       ===================================================== */

    function closeUiModal() {

        const modal =
            document.getElementById(
                "ui-modal"
            );


        if (!modal) {
            return;
        }


        modal.style.display =
            "none";


        document.body.style.overflow =
            "";

    }


    /* =====================================================
       ESCAPE KEY FOR MODAL
       ===================================================== */

    document.addEventListener(
        "keydown",
        function (event) {

            if (
                event.key !==
                "Escape"
            ) {
                return;
            }


            const modal =
                document.getElementById(
                    "ui-modal"
                );


            if (!modal) {
                return;
            }


            if (
                modal.style.display !==
                "none"
            ) {

                closeUiModal();

            }

        }
    );


    /* =====================================================
       WELCOME MODAL
       ===================================================== */

    function showWelcome() {

        /*
         * Only homepage
         */

        if (
            window.location.pathname !== "/" &&
            window.location.pathname !== ""
        ) {

            return;

        }


        /*
         * Don't show on every refresh
         */

        if (
            sessionStorage.getItem(
                "ce_welcome_seen"
            )
        ) {

            return;

        }


        sessionStorage.setItem(
            "ce_welcome_seen",
            "1"
        );


        setTimeout(
            function () {

                showUiModal(
                    "Welcome to Chand Enterprises",
                    "Order drinks, premium water and local delivery from one place.",
                    "Start Shopping"
                );

            },
            600
        );

    }


    /* =====================================================
       MOBILE VIEWPORT HEIGHT
       ===================================================== */

    function setViewportHeight() {

        const height =
            window.visualViewport
                ? window.visualViewport.height
                : window.innerHeight;


        document.documentElement.style
            .setProperty(
                "--viewport-height",
                `${height}px`
            );

    }


    /* =====================================================
       INITIALIZE
       ===================================================== */

    function init() {

        setupMobileMenu();

        setViewportHeight();

        showWelcome();

    }


    /* =====================================================
       EVENTS
       ===================================================== */

    window.addEventListener(
        "resize",
        setViewportHeight
    );


    if (
        window.visualViewport
    ) {

        window.visualViewport.addEventListener(
            "resize",
            setViewportHeight
        );

    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            init
        );

    } else {

        init();

    }


    /* =====================================================
       GLOBAL FUNCTIONS
       ===================================================== */

    window.showUiModal =
        showUiModal;


    window.closeUiModal =
        closeUiModal;


})();
