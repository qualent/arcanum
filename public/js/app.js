
/* =========================================
   ARCANUM — ГЛАВНАЯ СТРАНИЦА И АВТОРИЗАЦИЯ
========================================= */

function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        if (window.supabase && window.supabase.createClient) {
            resolve();
            return;
        }

        const script = document.createElement("script");

        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = resolve;

        script.onerror = () => {
            reject(new Error("Не удалось загрузить Supabase."));
        };

        document.head.appendChild(script);
    });
}


document.addEventListener("DOMContentLoaded", async function() {

    console.log("Arcanum loaded");

    try {

        await loadSupabaseLibrary();

        if (!window.CONFIG) {
            throw new Error("Конфигурация Arcanum не найдена.");
        }

        const supabaseClient = window.supabase.createClient(
            CONFIG.SUPABASE_URL,
            CONFIG.SUPABASE_ANON_KEY,
            {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true,
                    storage: window.localStorage
                }
            }
        );


        /* =========================================
           ОБНОВЛЕНИЕ КНОПОК НА ГЛАВНОЙ
        ========================================= */

        function updatePageForUser(session) {

            const isLoggedIn = Boolean(session && session.user);

            const loginButton = document.querySelector(".nav .nav-button");

            const startButtons = document.querySelectorAll(
                ".hero-buttons .button-primary, .cta .button-primary"
            );


            /* Кнопка в верхней шапке */

            if (loginButton) {

                if (isLoggedIn) {

                    loginButton.textContent = "Личный кабинет";

                    loginButton.href = "pages/dashboard.html";

                } else {

                    loginButton.textContent = "Войти";

                    loginButton.href = "pages/login.html";

                }

            }


            /* Кнопки начала приключения */

            startButtons.forEach(button => {

                if (isLoggedIn) {

                    button.href = "pages/dashboard.html";

                    if (button.closest(".hero-buttons")) {
                        button.textContent = "Продолжить приключение";
                    } else {
                        button.textContent = "Открыть кабинет";
                    }

                } else {

                    button.href = "pages/register.html";

                    if (button.closest(".hero-buttons")) {
                        button.textContent = "Начать приключение";
                    } else {
                        button.textContent = "Создать персонажа";
                    }

                }

            });


            console.log(
                isLoggedIn
                    ? "Arcanum: пользователь авторизован"
                    : "Arcanum: пользователь не авторизован"
            );

        }


        /* =========================================
           ПРОВЕРКА СОХРАНЁННОЙ СЕССИИ
        ========================================= */

        const {
            data,
            error
        } = await supabaseClient.auth.getSession();


        if (error) {
            throw error;
        }


        updatePageForUser(data.session);


        /* =========================================
           ОТСЛЕЖИВАНИЕ ИЗМЕНЕНИЙ АВТОРИЗАЦИИ
        ========================================= */

        supabaseClient.auth.onAuthStateChange(
            function(event, session) {

                updatePageForUser(session);

            }
        );


    } catch (error) {

        console.error("Ошибка авторизации Arcanum:", error);

    }

});
