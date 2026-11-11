
/* =========================================
   ARCANUM — ГЛАВНАЯ СТРАНИЦА
   Проверка и сохранение авторизации
========================================= */

function loadSupabaseLibrary() {
    return new Promise((resolve, reject) => {
        if (
            window.supabase &&
            typeof window.supabase.createClient === "function"
        ) {
            resolve();
            return;
        }

        const script = document.createElement("script");

        script.src =
            "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = () => {
            if (
                window.supabase &&
                typeof window.supabase.createClient === "function"
            ) {
                resolve();
            } else {
                reject(new Error("Supabase не загрузился."));
            }
        };

        script.onerror = () => {
            reject(new Error("Не удалось загрузить библиотеку Supabase."));
        };

        document.head.appendChild(script);
    });
}


function updatePageForUser(session) {
    const isLoggedIn = Boolean(session && session.user);

    const loginButton = document.querySelector(
        ".nav .nav-button"
    );

    const startButtons = document.querySelectorAll(
        ".hero-buttons .button-primary, .cta .button-primary"
    );

    // Кнопка в шапке
    if (loginButton) {
        if (isLoggedIn) {
            loginButton.textContent = "Личный кабинет";
            loginButton.href = "pages/dashboard.html";
        } else {
            loginButton.textContent = "Войти";
            loginButton.href = "pages/login.html";
        }
    }

    // Основные кнопки страницы
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
}


document.addEventListener("DOMContentLoaded", async function() {
    console.log("Arcanum loaded");

    try {
        await loadSupabaseLibrary();

        if (
            typeof CONFIG === "undefined" ||
            !CONFIG.SUPABASE_URL ||
            !CONFIG.SUPABASE_ANON_KEY
        ) {
            throw new Error("Не найдена конфигурация Supabase.");
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

        // Получаем сохранённую сессию
        const {
            data,
            error
        } = await supabaseClient.auth.getSession();

        if (error) {
            throw error;
        }

        updatePageForUser(data.session);

        // Следим за изменениями авторизации
        supabaseClient.auth.onAuthStateChange(
            function(event, session) {
                updatePageForUser(session);
            }
        );

        console.log(
            data.session
                ? "Arcanum: пользователь авторизован"
                : "Arcanum: пользователь не авторизован"
        );

    } catch (error) {
        console.error("Ошибка авторизации Arcanum:", error);
    }
});
