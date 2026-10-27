const supabaseClient = supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY
);


const campaignId =
    localStorage.getItem("arcanum_campaign_id");

const characterId =
    localStorage.getItem("arcanum_character_id");


let currentUser = null;
let currentCampaign = null;
let currentCharacter = null;


const elements = {

    campaignName:
        document.getElementById("campaignName"),

    characterInitial:
        document.getElementById("characterInitial"),

    characterName:
        document.getElementById("characterName"),

    characterSubtitle:
        document.getElementById("characterSubtitle"),

    characterLevel:
        document.getElementById("characterLevel"),

    hpText:
        document.getElementById("hpText"),

    hpFill:
        document.getElementById("hpFill"),

    saveStatus:
        document.getElementById("saveStatus"),

    systemMessage:
        document.getElementById("systemMessage"),

    storyTitle:
        document.getElementById("storyTitle"),

    goalText:
        document.getElementById("goalText"),

    backgroundText:
        document.getElementById("backgroundText"),

    actionInput:
        document.getElementById("actionInput"),

    actionButton:
        document.getElementById("actionButton"),

    diceResult:
        document.getElementById("diceResult"),

    settingsModal:
        document.getElementById("settingsModal")

};


function calculateModifier(value) {

    return Math.floor((Number(value) - 10) / 2);

}


function formatModifier(value) {

    const modifier =
        calculateModifier(value);

    return modifier >= 0
        ? "+" + modifier
        : modifier.toString();

}


function setText(id, value) {

    const element =
        document.getElementById(id);

    if (element) {
        element.textContent =
            value ?? "—";
    }

}


async function loadGame() {

    showLoading(true);

    try {

        const {
            data: {
                user
            },
            error: userError
        } = await supabaseClient.auth.getUser();


        if (userError || !user) {

            window.location.href =
                "login.html";

            return;
        }


        currentUser = user;


        if (!campaignId) {

            throw new Error(
                "ID кампании отсутствует."
            );
        }


        if (!characterId) {

            throw new Error(
                "ID персонажа отсутствует."
            );
        }


        await loadCampaign();

        await loadCharacter();


        renderGame();


        elements.saveStatus.textContent =
            "Сохранено";


        elements.systemMessage.textContent =
            "Кампания и персонаж успешно загружены из Supabase.";


    } catch (error) {

        console.error(error);

        elements.saveStatus.textContent =
            "Ошибка";


        elements.systemMessage.textContent =
            error.message ||
            "Не удалось загрузить игру.";


    } finally {

        showLoading(false);

    }

}


async function loadCampaign() {

    const {
        data,
        error
    } = await supabaseClient
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("user_id", currentUser.id)
        .maybeSingle();


    if (error) {

        throw new Error(
            "Ошибка загрузки кампании: " +
            error.message
        );

    }


    if (!data) {

        throw new Error(
            "Кампания не найдена."
        );

    }


    currentCampaign = data;

}


async function loadCharacter() {

    const {
        data,
        error
    } = await supabaseClient
        .from("characters")
        .select("*")
        .eq("id", characterId)
        .eq("user_id", currentUser.id)
        .maybeSingle();


    if (error) {

        throw new Error(
            "Ошибка загрузки персонажа: " +
            error.message
        );

    }


    if (!data) {

        throw new Error(
            "Персонаж не найден."
        );

    }


    if (
        data.campaign_id !==
        currentCampaign.id
    ) {

        throw new Error(
            "Персонаж не принадлежит этой кампании."
        );

    }


    currentCharacter = data;

}


function renderGame() {

    renderCampaign();

    renderCharacter();

    renderJournal();

}


function renderCampaign() {

    elements.campaignName.textContent =
        currentCampaign.name ||
        "Без названия";


    if (currentCampaign.setting) {

        elements.storyTitle.textContent =
            currentCampaign.setting;

    }


    document.title =
        "Arcanum — " +
        (currentCampaign.name || "Игра");

}


function renderCharacter() {

    const character =
        currentCharacter;


    const firstLetter =
        character.name
            ? character.name.charAt(0).toUpperCase()
            : "?";


    elements.characterInitial.textContent =
        firstLetter;


    elements.characterName.textContent =
        character.name;


    elements.characterSubtitle.textContent =
        `${character.race || "Неизвестная раса"} · ${character.class || "Без класса"}`;


    elements.characterLevel.textContent =
        character.level || 1;


    const maxHp =
        calculateMaxHp(character);


    const currentHp =
        maxHp;


    elements.hpText.textContent =
        `${currentHp} / ${maxHp}`;


    elements.hpFill.style.width =
        "100%";


    setText(
        "strengthValue",
        character.strength
    );

    setText(
        "dexterityValue",
        character.dexterity
    );

    setText(
        "constitutionValue",
        character.constitution
    );

    setText(
        "intelligenceValue",
        character.intelligence
    );

    setText(
        "wisdomValue",
        character.wisdom
    );

    setText(
        "charismaValue",
        character.charisma
    );


    setText(
        "strengthMod",
        formatModifier(character.strength)
    );

    setText(
        "dexterityMod",
        formatModifier(character.dexterity)
    );

    setText(
        "constitutionMod",
        formatModifier(character.constitution)
    );

    setText(
        "intelligenceMod",
        formatModifier(character.intelligence)
    );

    setText(
        "wisdomMod",
        formatModifier(character.wisdom)
    );

    setText(
        "charismaMod",
        formatModifier(character.charisma
        )
    );

}


function calculateMaxHp(character) {

    const constitutionModifier =
        calculateModifier(
            character.constitution
        );


    const level =
        Number(character.level) || 1;


    const className =
        String(character.class || "")
            .toLowerCase();


    let hitDie = 8;


    if (
        className.includes("варвар")
    ) {

        hitDie = 12;

    } else if (
        className.includes("воин") ||
        className.includes("паладин")
    ) {

        hitDie = 10;

    } else if (
        className.includes("волшебник") ||
        className.includes("маг") ||
        className.includes("чародей") ||
        className.includes("колдун")
    ) {

        hitDie = 6;

    }


    const hp =
        hitDie +
        constitutionModifier +
        ((level - 1) *
        (Math.floor(hitDie / 2) + 1 +
        constitutionModifier));


    return Math.max(
        hp,
        1
    );

}


function renderJournal() {

    elements.goalText.textContent =
        currentCharacter.goals ||
        "Цель персонажа ещё не определена.";


    elements.backgroundText.textContent =
        currentCharacter.background ||
        "—";

}


function rollDice(sides) {

    const result =
        Math.floor(
            Math.random() * sides
        ) + 1;


    elements.diceResult.textContent =
        result;


    elements.diceResult.classList.remove(
        "dice-roll-animation"
    );


    void elements.diceResult.offsetWidth;


    elements.diceResult.classList.add(
        "dice-roll-animation"
    );

}


document.querySelectorAll(
    ".dice-button"
).forEach(button => {

    button.addEventListener(
        "click",
        () => {

            const sides =
                Number(
                    button.dataset.dice
                );


            rollDice(sides);

        }
    );

});


elements.actionButton.addEventListener(
    "click",
    submitAction
);


elements.actionInput.addEventListener(
    "keydown",
    event => {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            submitAction();

        }

    }
);


function submitAction() {

    const text =
        elements.actionInput.value.trim();


    if (!text) {
        return;
    }


    addPlayerMessage(text);


    elements.actionInput.value = "";


    addSystemMessage(
        "Игровой движок пока не подключён. Следующий этап — обработка действий персонажа и генерация ответа мастера."
    );

}


function addPlayerMessage(text) {

    const article =
        document.createElement("article");


    article.className =
        "story-message player-message";


    article.innerHTML = `

        <div class="message-label">
            ${escapeHtml(currentCharacter.name)}
        </div>

        <p>
            ${escapeHtml(text)}
        </p>

    `;


    document
        .getElementById("storyLog")
        .appendChild(article);


    scrollStoryToBottom();

}


function addSystemMessage(text) {

    const article =
        document.createElement("article");


    article.className =
        "story-message system-message";


    article.innerHTML = `

        <div class="message-label">
            СИСТЕМА
        </div>

        <p>
            ${escapeHtml(text)}
        </p>

    `;


    document
        .getElementById("storyLog")
        .appendChild(article);


    scrollStoryToBottom();

}


function scrollStoryToBottom() {

    const log =
        document.getElementById("storyLog");


    log.scrollTop =
        log.scrollHeight;

}


function escapeHtml(text) {

    const div =
        document.createElement("div");

    div.textContent =
        text;

    return div.innerHTML;

}


document
    .getElementById("settingsButton")
    .addEventListener(
        "click",
        () => {

            elements.settingsModal.hidden =
                false;

        }
    );


document
    .getElementById("closeSettings")
    .addEventListener(
        "click",
        closeSettings
    );


document
    .getElementById("closeSettingsButton")
    .addEventListener(
        "click",
        closeSettings
    );


function closeSettings() {

    elements.settingsModal.hidden =
        true;

}


document
    .getElementById("exitButton")
    .addEventListener(
        "click",
        async () => {

            await supabaseClient.auth.signOut();

            window.location.href =
                "login.html";

        }
    );


function showLoading(show) {

    const loader =
        document.getElementById("gameLoading");


    loader.classList.toggle(
        "hidden",
        !show
    );

}


loadGame();
