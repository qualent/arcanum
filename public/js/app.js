
/* =========================================
   ARCANUM — ГЛАВНАЯ СТРАНИЦА
   Авторизация и сохранение сессии
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
        script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

        script.onload = () => {
            if (window.supabase) {
                resolve();
            } else {
                reject(new Error("Supabase не загрузился."));
            }
        };

        script.onerror = () => {
            reject(new Error("Ошибка загрузки Supabase CDN."));
        };

        document.head.appendChild(script);
    });
}


function updatePageForUser(session) {
    const isLoggedIn = Boolean(session && session.user);

    const loginButton = document.querySelector(
        "#main-site-header .nav-button"
    );

    const startButtons = document.querySelectorAll(
        ".hero-buttons .button-primary, .cta .button-primary"
    );

    if (loginButton) {
        loginButton.textContent = isLoggedIn
            ? "Личный кабинет"
            : "Войти";

        loginButton.href = isLoggedIn
            ? "pages/dashboard.html"
            : "pages/login.html";
    }

    startButtons.forEach(button => {
        if (isLoggedIn) {
            button.href = "pages/dashboard.html";

            button.textContent = button.closest(".hero-buttons")
                ? "Продолжить приключение"
                : "Открыть кабинет";
        } else {
            button.href = "pages/register.html";

            button.textContent = button.closest(".hero-buttons")
                ? "Начать приключение"
                : "Создать персонажа";
        }
    });
}


document.addEventListener("DOMContentLoaded", async () => {
    try {
        await loadSupabaseLibrary();

        // CONFIG объявлен через const в config.js.
        // Поэтому проверяем именно CONFIG, а не window.CONFIG.
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

        // Получаем текущую сессию
        const { data, error } =
            await supabaseClient.auth.getSession();

        if (error) {
            throw error;
        }

        updatePageForUser(data.session);

        // Отслеживаем вход и выход
        supabaseClient.auth.onAuthStateChange(
            (event, session) => {
                updatePageForUser(session);
            }
        );

        console.log(
            data.session
                ? "Arcanum: пользователь авторизован"
                : "Arcanum: пользователь не авторизован"
        );

    } catch (error) {
        console.error("Arcanum auth error:", error);
    }
});
