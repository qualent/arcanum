const supabaseClient = supabase.createClient(
    CONFIG.SUPABASE_URL,
    CONFIG.SUPABASE_ANON_KEY
);

const campaignId = localStorage.getItem("arcanum_campaign_id");
const characterId = localStorage.getItem("arcanum_character_id");

let currentUser = null;
let currentCampaign = null;
let currentCharacter = null;
let currentGameState = null;
let currentInventory = [];
let isSaving = false;

const elements = {
    campaignName: document.getElementById("campaignName"),
    characterInitial: document.getElementById("characterInitial"),
    characterName: document.getElementById("characterName"),
    characterSubtitle: document.getElementById("characterSubtitle"),
    characterLevel: document.getElementById("characterLevel"),
    hpText: document.getElementById("hpText"),
    hpFill: document.getElementById("hpFill"),
    saveStatus: document.getElementById("saveStatus"),
    systemMessage: document.getElementById("systemMessage"),
    storyTitle: document.getElementById("storyTitle"),
    goalText: document.getElementById("goalText"),
    backgroundText: document.getElementById("backgroundText"),
    actionInput: document.getElementById("actionInput"),
    actionButton: document.getElementById("actionButton"),
    diceResult: document.getElementById("diceResult"),
    checkStat: document.getElementById("checkStat"),
    checkDc: document.getElementById("checkDc"),
    checkButton: document.getElementById("checkButton"),
    checkResult: document.getElementById("checkResult"),
    experienceValue: document.getElementById("experienceValue"),
    goldValue: document.getElementById("goldValue"),
    resourceAmount: document.getElementById("resourceAmount"),
    hpAmount: document.getElementById("hpAmount"),
    addExperienceButton: document.getElementById("addExperienceButton"),
    addGoldButton: document.getElementById("addGoldButton"),
    healButton: document.getElementById("healButton"),
    damageButton: document.getElementById("damageButton"),
    settingsModal: document.getElementById("settingsModal"),
    storyLog: document.getElementById("storyLog"),
    inventoryList: document.getElementById("inventoryList"),
    inventoryCount: document.querySelector(".item-count"),
    locationText: document.getElementById("locationText"),
    timeText: document.getElementById("timeText"),
    dayText: document.getElementById("dayText")
};

function calculateModifier(value) {
    return Math.floor((Number(value ?? 10) - 10) / 2);
}

function formatModifier(value) {
    const modifier = calculateModifier(value);
    return modifier >= 0 ? "+" + modifier : String(modifier);
}

function setText(element, value, fallback = "—") {
    if (element) {
        element.textContent = value ?? fallback;
    }
}

function setSaveStatus(status) {
    setText(elements.saveStatus, status);
}

function showLoading(show) {
    const loader = document.getElementById("gameLoading");
    if (loader) {
        loader.classList.toggle("hidden", !show);
    }
}

function getHitDie(character) {
    const className = String(character.class || "").toLowerCase();

    if (className.includes("варвар") || className.includes("barbarian")) return 12;

    if (
        className.includes("воин") ||
        className.includes("паладин") ||
        className.includes("следопыт") ||
        className.includes("fighter") ||
        className.includes("paladin") ||
        className.includes("ranger")
    ) return 10;

    if (
        className.includes("волшебник") ||
        className.includes("маг") ||
        className.includes("чародей") ||
        className.includes("sorcerer") ||
        className.includes("wizard")
    ) return 6;

    return 8;
}

function calculateMaxHp(character) {
    const level = Math.max(1, Number(character.level) || 1);
    const constitutionModifier = calculateModifier(character.constitution);
    const hitDie = getHitDie(character);
    const firstLevelHp = hitDie + constitutionModifier;
    const laterLevelsHp = (Math.floor(hitDie / 2) + 1 + constitutionModifier) * (level - 1);

    return Math.max(1, firstLevelHp + laterLevelsHp);
}

function getCharacterStat(character, stat) {
    const flatValue = character[stat];
    if (flatValue !== null && flatValue !== undefined) {
        return Number(flatValue);
    }

    const stats = character.stats || {};
    const aliases = {
        strength: ["strength", "str", "СИЛ"],
        dexterity: ["dexterity", "dex", "ЛОВ"],
        constitution: ["constitution", "con", "ТЕЛ"],
        intelligence: ["intelligence", "int", "ИНТ"],
        wisdom: ["wisdom", "wis", "МДР"],
        charisma: ["charisma", "cha", "ХАР"]
    };

    for (const key of aliases[stat] || []) {
        if (stats[key] !== undefined && stats[key] !== null) {
            return Number(stats[key]);
        }
    }

    return 10;
}

async function loadGame() {
    showLoading(true);
    setSaveStatus("Загрузка...");

    try {
        const { data: { user }, error: userError } = await supabaseClient.auth.getUser();

        if (userError || !user) {
            window.location.href = "login.html";
            return;
        }

        currentUser = user;

        if (!campaignId || !characterId) {
            throw new Error("Не найдены ID кампании или персонажа. Вернись в личный кабинет и открой игру оттуда.");
        }

        await loadCampaign();
        await loadCharacter();
        await loadOrCreateGameState();
        await Promise.all([
            loadInventory(),
            loadMessages()
        ]);

        renderGame();
        setSaveStatus("Сохранено");
        setText(elements.systemMessage, "Игровое состояние загружено. Прогресс сохраняется в Supabase.");
    } catch (error) {
        console.error("Arcanum game loading error:", error);
        setSaveStatus("Ошибка загрузки");
        setText(elements.systemMessage, error.message || "Не удалось загрузить игру.");
    } finally {
        showLoading(false);
    }
}

async function loadCampaign() {
    const { data, error } = await supabaseClient
        .from("campaigns")
        .select("*")
        .eq("id", campaignId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (error) throw new Error("Ошибка загрузки кампании: " + error.message);
    if (!data) throw new Error("Кампания не найдена или у тебя нет к ней доступа.");

    currentCampaign = data;
}

async function loadCharacter() {
    const { data, error } = await supabaseClient
        .from("characters")
        .select("*")
        .eq("id", characterId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (error) throw new Error("Ошибка загрузки персонажа: " + error.message);
    if (!data) throw new Error("Персонаж не найден или у тебя нет к нему доступа.");

    if (data.campaign_id !== currentCampaign.id) {
        throw new Error("Выбранный персонаж не принадлежит этой кампании.");
    }

    currentCharacter = data;
}

async function loadOrCreateGameState() {
    const { data: existingState, error: loadError } = await supabaseClient
        .from("game_states")
        .select("*")
        .eq("character_id", characterId)
        .eq("campaign_id", campaignId)
        .eq("user_id", currentUser.id)
        .maybeSingle();

    if (loadError) {
        throw new Error("Ошибка загрузки игрового состояния: " + loadError.message);
    }

    if (existingState) {
        currentGameState = existingState;
        const calculatedMaxHp = calculateMaxHp(currentCharacter);

        if (Number(currentGameState.max_hp) !== calculatedMaxHp) {
            const adjustedHp = Math.min(
                Number(currentGameState.current_hp),
                calculatedMaxHp
            );

            const { data, error } = await supabaseClient
                .from("game_states")
                .update({
                    max_hp: calculatedMaxHp,
                    current_hp: Math.max(0, adjustedHp),
                    updated_at: new Date().toISOString()
                })
                .eq("id", currentGameState.id)
                .eq("user_id", currentUser.id)
                .select()
                .single();

            if (error) {
                throw new Error("Не удалось обновить максимальное здоровье: " + error.message);
            }

            currentGameState = data;
        }

        return;
    }

    const maxHp = calculateMaxHp(currentCharacter);
    const newState = {
        user_id: currentUser.id,
        campaign_id: campaignId,
        character_id: characterId,
        current_hp: maxHp,
        max_hp: maxHp,
        location: "Неизвестно",
        game_day: 1,
        game_time: "Утро",
        experience: 0,
        gold: 0
    };

    const { data, error } = await supabaseClient
        .from("game_states")
        .insert(newState)
        .select()
        .single();

    if (error && error.code === "23505") {
        const { data: racedState, error: racedError } = await supabaseClient
            .from("game_states")
            .select("*")
            .eq("character_id", characterId)
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (racedError || !racedState) {
            throw new Error("Не удалось получить созданное игровое состояние: " + (racedError?.message || error.message));
        }

        currentGameState = racedState;
        return;
    }

    if (error) {
        throw new Error("Не удалось создать игровое состояние: " + error.message);
    }

    currentGameState = data;
}

async function loadInventory() {
    const { data, error } = await supabaseClient
        .from("inventory")
        .select("*")
        .eq("character_id", characterId)
        .eq("campaign_id", campaignId)
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: true });

    if (error) throw new Error("Ошибка загрузки инвентаря: " + error.message);
    currentInventory = data || [];
}

async function loadMessages() {
    const { data, error } = await supabaseClient
        .from("game_messages")
        .select("*")
        .eq("character_id", characterId)
        .eq("campaign_id", campaignId)
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(150);

    if (error) throw new Error("Ошибка загрузки истории игры: " + error.message);

    renderMessages((data || []).reverse());
}

function renderGame() {
    renderCampaign();
    renderCharacter();
    renderGameState();
    renderInventory();
    renderJournal();
}

function renderCampaign() {
    setText(elements.campaignName, currentCampaign.name, "Без названия");

    if (currentCampaign.setting) {
        setText(elements.storyTitle, currentCampaign.setting);
    }

    document.title = "Arcanum — " + (currentCampaign.name || "Игра");
}

function renderCharacter() {
    const character = currentCharacter;
    const name = character.name || "Без имени";

    setText(elements.characterInitial, name.charAt(0).toUpperCase(), "?");
    setText(elements.characterName, name);
    setText(
        elements.characterSubtitle,
        (character.race || "Неизвестная раса") + " · " + (character.class || "Без класса")
    );
    setText(elements.characterLevel, character.level || 1);

    const stats = ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"];

    for (const stat of stats) {
        const value = getCharacterStat(character, stat);
        setText(document.getElementById(stat + "Value"), value);
        setText(document.getElementById(stat + "Mod"), formatModifier(value));
    }

    renderHealth();
}

function renderHealth() {
    if (!currentGameState) return;

    const currentHp = Number(currentGameState.current_hp) || 0;
    const maxHp = Math.max(1, Number(currentGameState.max_hp) || 1);
    const percentage = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));

    setText(elements.hpText, currentHp + " / " + maxHp);
    if (elements.hpFill) {
        elements.hpFill.style.width = percentage + "%";
    }
}

function renderGameState() {
    if (!currentGameState) return;

    setText(elements.locationText, currentGameState.location, "Неизвестно");
    setText(elements.timeText, currentGameState.game_time, "Утро");
    setText(elements.dayText, currentGameState.game_day, "1");
    setText(elements.experienceValue, Number(currentGameState.experience) || 0, "0");
    setText(elements.goldValue, Number(currentGameState.gold) || 0, "0");
}

function renderInventory() {
    if (!elements.inventoryList) return;

    elements.inventoryList.replaceChildren();

    if (elements.inventoryCount) {
        const totalItems = currentInventory.reduce(
            (sum, item) => sum + (Number(item.quantity) || 0),
            0
        );
        elements.inventoryCount.textContent = String(totalItems);
    }

    if (!currentInventory.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "Инвентарь пока пуст.";
        elements.inventoryList.appendChild(empty);
        return;
    }

    currentInventory.forEach(item => {
        const row = document.createElement("div");
        row.className = "inventory-item";

        const details = document.createElement("div");
        details.className = "inventory-item-info";

        const name = document.createElement("strong");
        name.textContent = item.item_name || "Предмет";

        const description = document.createElement("p");
        description.textContent = item.description || "";

        const quantity = document.createElement("span");
        quantity.className = "inventory-quantity";
        quantity.textContent = "×" + (Number(item.quantity) || 1);

        details.append(name, description);
        row.append(details, quantity);
        elements.inventoryList.appendChild(row);
    });
}

function renderJournal() {
    setText(elements.goalText, currentCharacter.goals, "Цель персонажа ещё не определена.");
    setText(elements.backgroundText, currentCharacter.background || currentCharacter.history, "—");
}

function renderMessages(messages) {
    if (!elements.storyLog) return;

    elements.storyLog.replaceChildren();

    if (!messages.length) {
        const welcome = document.createElement("article");
        welcome.className = "story-message dm-message";

        const label = document.createElement("div");
        label.className = "message-label";
        label.textContent = "МАСТЕР";

        const paragraph = document.createElement("p");
        paragraph.textContent = "Приключение начинается. Твои действия и результаты бросков будут сохраняться в журнал.";

        welcome.append(label, paragraph);
        elements.storyLog.appendChild(welcome);
    } else {
        messages.forEach(message => {
            const article = document.createElement("article");
            article.className = "story-message " + getMessageClass(message.role);

            const label = document.createElement("div");
            label.className = "message-label";
            label.textContent = getMessageLabel(message.role);

            const paragraph = document.createElement("p");
            paragraph.textContent = message.content || "";

            article.append(label, paragraph);
            elements.storyLog.appendChild(article);
        });
    }

    const system = document.createElement("article");
    system.className = "story-message system-message";

    const systemLabel = document.createElement("div");
    systemLabel.className = "message-label";
    systemLabel.textContent = "СИСТЕМА";

    const systemText = document.createElement("p");
    systemText.id = "systemMessage";
    systemText.textContent = "Игровое состояние загружено.";

    system.append(systemLabel, systemText);
    elements.storyLog.appendChild(system);
    elements.systemMessage = systemText;

    scrollStoryToBottom();
}

function getMessageClass(role) {
    if (role === "player") return "player-message";
    if (role === "assistant") return "dm-message";
    return "system-message";
}

function getMessageLabel(role) {
    if (role === "player") return currentCharacter ? currentCharacter.name : "ИГРОК";
    if (role === "assistant") return "МАСТЕР";
    return "СИСТЕМА";
}

async function saveMessage(role, content) {
    const message = {
        user_id: currentUser.id,
        campaign_id: campaignId,
        character_id: characterId,
        role,
        content
    };

    const { data, error } = await supabaseClient
        .from("game_messages")
        .insert(message)
        .select()
        .single();

    if (error) {
        throw new Error("Не удалось сохранить запись в журнал: " + error.message);
    }

    appendMessage(data);
    return data;
}

function appendMessage(message) {
    if (!elements.storyLog) return;

    const article = document.createElement("article");
    article.className = "story-message " + getMessageClass(message.role);

    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = getMessageLabel(message.role);

    const paragraph = document.createElement("p");
    paragraph.textContent = message.content || "";

    article.append(label, paragraph);
    elements.storyLog.appendChild(article);
    scrollStoryToBottom();
}

async function runAbilityCheck() {
    if (!currentUser || !currentCharacter || isSaving) return;

    const stat = elements.checkStat ? elements.checkStat.value : "strength";
    const difficulty = Number(elements.checkDc ? elements.checkDc.value : 12);

    if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 30) {
        setText(elements.checkResult, "Укажи сложность от 1 до 30.");
        return;
    }

    const statNames = {
        strength: "Сила",
        dexterity: "Ловкость",
        constitution: "Телосложение",
        intelligence: "Интеллект",
        wisdom: "Мудрость",
        charisma: "Харизма"
    };

    const statValue = getCharacterStat(currentCharacter, stat);
    const modifier = calculateModifier(statValue);
    const die = Math.floor(Math.random() * 20) + 1;
    const total = die + modifier;
    const success = total >= difficulty;
    const outcome = success ? "УСПЕХ" : "ПРОВАЛ";
    const sign = modifier >= 0 ? "+" : "";
    const resultText = "Проверка: " + statNames[stat] +
        " — d20 (" + die + ") " + sign + modifier +
        " = " + total + " против СЛ " + difficulty +
        " — " + outcome + ".";

    setText(elements.checkResult, resultText);
    setText(elements.diceResult, die);

    if (elements.diceResult) {
        elements.diceResult.classList.remove("dice-roll-animation");
        void elements.diceResult.offsetWidth;
        elements.diceResult.classList.add("dice-roll-animation");
    }

    isSaving = true;
    if (elements.checkButton) elements.checkButton.disabled = true;
    setSaveStatus("Сохранение проверки...");

    try {
        await saveMessage("system", resultText);
        setSaveStatus("Сохранено");
    } catch (error) {
        console.error(error);
        setSaveStatus("Ошибка сохранения");
        setText(elements.checkResult, resultText + " Не удалось сохранить результат: " + error.message);
    } finally {
        isSaving = false;
        if (elements.checkButton) elements.checkButton.disabled = false;
    }
}

async function updateGameState(changes, journalText) {
    if (!currentGameState || isSaving) return false;

    isSaving = true;
    setSaveStatus("Сохранение...");
    setControlButtonsDisabled(true);

    try {
        const { data, error } = await supabaseClient
            .from("game_states")
            .update({
                ...changes,
                updated_at: new Date().toISOString()
            })
            .eq("id", currentGameState.id)
            .eq("user_id", currentUser.id)
            .select()
            .single();

        if (error) throw new Error(error.message);

        currentGameState = data;
        renderHealth();
        renderGameState();

        if (journalText) {
            await saveMessage("system", journalText);
        }

        setSaveStatus("Сохранено");
        return true;
    } catch (error) {
        console.error("Game state update error:", error);
        setSaveStatus("Ошибка сохранения");
        setText(elements.systemMessage, "Не удалось сохранить изменение: " + error.message);
        return false;
    } finally {
        isSaving = false;
        setControlButtonsDisabled(false);
    }
}

function setControlButtonsDisabled(disabled) {
    [
        elements.healButton,
        elements.damageButton,
        elements.addExperienceButton,
        elements.addGoldButton,
        elements.actionButton,
        elements.checkButton
    ].forEach(button => {
        if (button) button.disabled = disabled;
    });
}

async function changeHealth(operation) {
    if (!currentGameState || isSaving) return;

    const amount = Number(elements.hpAmount ? elements.hpAmount.value : 0);

    if (!Number.isInteger(amount) || amount < 1 || amount > 9999) {
        setText(elements.systemMessage, "Укажи количество HP от 1 до 9999.");
        return;
    }

    const currentHp = Number(currentGameState.current_hp) || 0;
    const maxHp = Number(currentGameState.max_hp) || 1;
    const nextHp = operation === "heal"
        ? Math.min(maxHp, currentHp + amount)
        : Math.max(0, currentHp - amount);

    if (nextHp === currentHp) {
        setText(elements.systemMessage, operation === "heal"
            ? "Здоровье уже полное."
            : "Здоровье уже на нуле.");
        return;
    }

    const difference = Math.abs(nextHp - currentHp);
    const text = operation === "heal"
        ? "Персонаж восстановил " + difference + " HP. Здоровье: " + nextHp + "/" + maxHp + "."
        : "Персонаж получил " + difference + " урона. Здоровье: " + nextHp + "/" + maxHp + ".";

    await updateGameState({ current_hp: nextHp }, text);
}

async function changeResource(resource) {
    if (!currentGameState || isSaving) return;

    const amount = Number(elements.resourceAmount ? elements.resourceAmount.value : 0);

    if (!Number.isInteger(amount) || amount < 1 || amount > 100000) {
        setText(elements.systemMessage, "Укажи количество от 1 до 100000.");
        return;
    }

    const currentValue = Number(currentGameState[resource]) || 0;
    const nextValue = currentValue + amount;

    if (nextValue > 2147483647) {
        setText(elements.systemMessage, "Полученное значение слишком велико.");
        return;
    }

    const resourceName = resource === "experience" ? "опыта" : "золота";
    const text = "Персонаж получил " + amount + " " + resourceName +
        ". Всего: " + nextValue + ".";

    await updateGameState({ [resource]: nextValue }, text);
}

async function submitAction() {
    const action = elements.actionInput ? elements.actionInput.value.trim() : "";

    if (!action || !currentUser || !currentCharacter || isSaving) return;

    if (action.length > 5000) {
        setText(elements.systemMessage, "Сообщение слишком длинное. Максимум — 5000 символов.");
        return;
    }

    isSaving = true;
    if (elements.actionButton) elements.actionButton.disabled = true;
    setSaveStatus("Сохранение...");

    try {
        await saveMessage("player", action);
        elements.actionInput.value = "";
        setSaveStatus("Сохранено");
    } catch (error) {
        console.error(error);
        setSaveStatus("Ошибка сохранения");
        setText(elements.systemMessage, error.message);
    } finally {
        isSaving = false;
        if (elements.actionButton) elements.actionButton.disabled = false;
    }
}

async function rollDice(sides) {
    if (!Number.isInteger(sides) || sides < 2 || !currentUser || isSaving) return;

    const result = Math.floor(Math.random() * sides) + 1;
    setText(elements.diceResult, result);

    if (elements.diceResult) {
        elements.diceResult.classList.remove("dice-roll-animation");
        void elements.diceResult.offsetWidth;
        elements.diceResult.classList.add("dice-roll-animation");
    }

    const rollText = "Бросок d" + sides + ": " + result;
    setSaveStatus("Сохранение броска...");

    try {
        await saveMessage("system", rollText);
        setSaveStatus("Сохранено");
    } catch (error) {
        console.error(error);
        setSaveStatus("Ошибка сохранения");
        setText(elements.systemMessage, "Бросок состоялся, но не удалось сохранить его: " + error.message);
    }
}

function scrollStoryToBottom() {
    if (elements.storyLog) {
        elements.storyLog.scrollTop = elements.storyLog.scrollHeight;
    }
}

function bindEvents() {
    document.querySelectorAll(".dice-button").forEach(button => {
        button.addEventListener("click", () => {
            const sides = Number(button.dataset.dice);
            rollDice(sides);
        });
    });

    if (elements.actionButton) {
        elements.actionButton.addEventListener("click", submitAction);
    }

    if (elements.actionInput) {
        elements.actionInput.addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submitAction();
            }
        });
    }

    if (elements.checkButton) {
        elements.checkButton.addEventListener("click", runAbilityCheck);
    }

    if (elements.healButton) {
        elements.healButton.addEventListener("click", () => changeHealth("heal"));
    }

    if (elements.damageButton) {
        elements.damageButton.addEventListener("click", () => changeHealth("damage"));
    }

    if (elements.addExperienceButton) {
        elements.addExperienceButton.addEventListener("click", () => changeResource("experience"));
    }

    if (elements.addGoldButton) {
        elements.addGoldButton.addEventListener("click", () => changeResource("gold"));
    }

    const settingsButton = document.getElementById("settingsButton");
    const closeSettings = document.getElementById("closeSettings");
    const closeSettingsButton = document.getElementById("closeSettingsButton");

    if (settingsButton && elements.settingsModal) {
        settingsButton.addEventListener("click", () => {
            elements.settingsModal.hidden = false;
        });
    }

    if (closeSettings) closeSettings.addEventListener("click", closeSettingsModal);
    if (closeSettingsButton) closeSettingsButton.addEventListener("click", closeSettingsModal);

    const exitButton = document.getElementById("exitButton");
    if (exitButton) {
        exitButton.addEventListener("click", () => {
            window.location.href = "dashboard.html";
        });
    }
}

function closeSettingsModal() {
    if (elements.settingsModal) {
        elements.settingsModal.hidden = true;
    }
}

bindEvents();
loadGame();
