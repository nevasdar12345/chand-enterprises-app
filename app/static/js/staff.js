/* =========================================================
   CHAND ENTERPRISES
   STAFF LOGIN JAVASCRIPT
   ========================================================= */


/* =========================
   HELPERS
   ========================= */

const $ = selector =>
    document.querySelector(selector);


/* =========================
   STAFF LOGIN
   ========================= */

async function staffLogin() {

    const role =
        $('#srole')?.value || 'admin';

    const username =
        $('#suser')?.value.trim();

    const password =
        $('#spass')?.value;

    const error =
        $('#serr');


    /*
     * Clear old error
     */

    if (error) {
        error.textContent = '';
    }


    /*
     * Basic validation
     */

    if (!username) {

        if (error) {
            error.textContent =
                'Enter your username';
        }

        $('#suser')?.focus();

        return;
    }


    if (!password) {

        if (error) {
            error.textContent =
                'Enter your password';
        }

        $('#spass')?.focus();

        return;
    }


    /*
     * Disable button while logging in
     */

    const button =
        document.querySelector(
            '.staff-login-button'
        );


    if (button) {
        button.disabled = true;
    }


    try {

        const response =
            await fetch(
                '/api/login',
                {
                    method: 'POST',

                    headers: {
                        'Content-Type':
                            'application/json'
                    },

                    body:
                        JSON.stringify({
                            role,
                            username,
                            password
                        })
                }
            );


        const result =
            await response
                .json()
                .catch(() => ({}));


        /*
         * Login failed
         */

        if (!response.ok || !result.ok) {

            if (error) {

                error.textContent =
                    result.error ||
                    'Invalid credentials';

            }

            return;
        }


        /*
         * Login successful
         */

        window.location.href =
            result.redirect ||
            '/dashboard';


    } catch (err) {

        console.error(
            'Staff login error:',
            err
        );


        if (error) {

            error.textContent =
                'Unable to connect to server';

        }

    } finally {

        if (button) {
            button.disabled = false;
        }

    }
}


/* =========================
   ENTER KEY LOGIN
   ========================= */

function enableStaffEnterLogin() {

    const username =
        $('#suser');

    const password =
        $('#spass');


    [username, password]
        .forEach(input => {

            if (!input) {
                return;
            }


            input.addEventListener(
                'keydown',
                event => {

                    if (
                        event.key ===
                        'Enter'
                    ) {

                        event.preventDefault();

                        staffLogin();
                    }

                }
            );

        });
}


/* =========================
   GLOBAL
   ========================= */

window.staffLogin =
    staffLogin;


/* =========================
   STARTUP
   ========================= */

document.addEventListener(
    'DOMContentLoaded',
    () => {

        enableStaffEnterLogin();

    }
);
