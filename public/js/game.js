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
    proficiencyList: document.getElementById("proficiencyList"),
    featureList: document.getElementById("featureList"),
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
        await initializeCharacterOnServer();
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

async function initializeCharacterOnServer() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session || !session.access_token) throw new Error("Сессия истекла. Войди снова.");
    const response = await fetch("/api/character/initialize", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + session.access_token
        },
        body: JSON.stringify({ campaign_id: campaignId, character_id: characterId })
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
        throw new Error(result.error || "Не удалось загрузить лист персонажа и стартовый инвентарь.");
    }
    if (result.state) currentGameState = result.state;
    if (Array.isArray(result.inventory)) currentInventory = result.inventory;
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

    renderCharacterDetails();
    renderHealth();
}

function renderCharacterDetails() {
    const stats = currentCharacter.stats && typeof currentCharacter.stats === "object" ? currentCharacter.stats : {};
    const rows = [
        ["Спасброски", Array.isArray(stats.saving_throw_proficiencies) ? stats.saving_throw_proficiencies.map(key => ({strength:"Сила",dexterity:"Ловкость",constitution:"Телосложение",intelligence:"Интеллект",wisdom:"Мудрость",charisma:"Харизма"}[key] || key)).join(", ") : "Не указаны"],
        ["Навыки", Array.isArray(stats.skill_proficiencies) ? stats.skill_proficiencies.join(", ") : "Не указаны"],
        ["Бонус мастерства", stats.proficiency_bonus ? "+" + stats.proficiency_bonus : "+2"],
        ["Подкласс", stats.subclass || "Выбирается на следующем уровне по правилам класса"],
        ["Доспехи", stats.armor_proficiencies || "Не указаны"],
        ["Оружие", stats.weapon_proficiencies || "Не указано"],
        ["Инструменты", stats.tool_proficiencies || "Нет"],
        ["Языки", stats.languages || "Не указаны"],
        ["Скорость / размер", (stats.speed || 30) + " фт. · " + (stats.size || "Средний")]
    ];
    if (elements.proficiencyList) {
        elements.proficiencyList.replaceChildren();
        rows.forEach(([title, value]) => {
            const row = document.createElement("div");
            row.className = "sheet-detail-item";
            const strong = document.createElement("strong");
            strong.textContent = title;
            const p = document.createElement("p");
            p.textContent = value;
            row.append(strong, p);
            elements.proficiencyList.appendChild(row);
        });
    }
    if (elements.featureList) {
        elements.featureList.replaceChildren();
        const features = [
            ["Особенности расы", stats.racial_traits],
            ["Особенность подкласса", stats.subclass_feature],
            ["Особенность класса", stats.class_features],
            ["Предыстория", stats.background_feature],
            ["Черта", stats.feat && stats.feat.name ? stats.feat.name + " — " + stats.feat.description : "Нет дополнительной черты"]
        ];
        const magic = stats.spellcasting;
        if (magic) {
            const spells = (magic.cantrips || []).concat(magic.known_spells || [], magic.prepared_spells || [], stats.subclass_bonus_spells || []);
            const abilityNames = {charisma:"Харизма",wisdom:"Мудрость",intelligence:"Интеллект"};
            const magicText = "Основа: " + (abilityNames[magic.ability] || magic.ability) +
                " · СЛ " + magic.spell_save_dc + " · атака +" + magic.spell_attack_bonus +
                " · ячейки 1 уровня: " + magic.spell_slots_level_1 +
                ". Заговоры и заклинания: " + (spells.length ? spells.join(", ") : "не выбраны");
            features.push(["Магия", magicText]);
        }
        features.forEach(([title, value]) => {
            if (!value) return;
            const row = document.createElement("div");
            row.className = "sheet-detail-item";
            const strong = document.createElement("strong");
            strong.textContent = title;
            const p = document.createElement("p");
            p.textContent = value;
            row.append(strong, p);
            elements.featureList.appendChild(row);
        });
    }
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
        paragraph.textContent = "Приключение начинается. Мастер сам назначает проверки и выполняет необходимые броски.";

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

async function submitAction() {
    const action = elements.actionInput ? elements.actionInput.value.trim() : "";
    if (!action || !currentUser || !currentCharacter || isSaving) return;

    if (action.length > 5000) {
        setText(elements.systemMessage, "Сообщение слишком длинное. Максимум — 5000 символов.");
        return;
    }

    isSaving = true;
    if (elements.actionButton) elements.actionButton.disabled = true;
    setSaveStatus("Мастер думает...");
    setText(elements.systemMessage, "Мастер обдумывает ситуацию...");

    let playerShown = false;
    let streamingArticle = null;
    let streamingText = "";
    let completedResult = null;

    const showPlayerMessage = function (message) {
        if (playerShown) return;
        appendMessage(message || { role: "player", content: action });
        playerShown = true;
        elements.actionInput.value = "";
    };

    const showNarrativeDelta = function (delta) {
        if (!delta) return;
        if (!streamingArticle) {
            streamingArticle = document.createElement("article");
            streamingArticle.className = "story-message dm-message";
            const label = document.createElement("div");
            label.className = "message-label";
            label.textContent = "МАСТЕР";
            const paragraph = document.createElement("p");
            paragraph.className = "streaming-narrative";
            streamingArticle.append(label, paragraph);
            elements.storyLog.appendChild(streamingArticle);
        }
        streamingText += delta;
        streamingArticle.querySelector("p").textContent = streamingText;
        scrollStoryToBottom();
    };

    try {
        const { data: sessionData, error: sessionError } = await supabaseClient.auth.getSession();
        const accessToken = sessionData && sessionData.session ? sessionData.session.access_token : null;
        if (sessionError || !accessToken) throw new Error("Сессия истекла. Войди в аккаунт заново.");

        const response = await fetch("/api/game/action", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + accessToken,
                "Accept": "text/event-stream"
            },
            body: JSON.stringify({ campaign_id: campaignId, character_id: characterId, action: action })
        });

        const contentType = response.headers.get("content-type") || "";
        if (!response.ok || !contentType.includes("text/event-stream")) {
            const errorResult = await response.json().catch(() => ({}));
            throw new Error(errorResult.error || "Не удалось получить потоковый ответ мастера.");
        }
        if (!response.body) throw new Error("Браузер не поддерживает потоковый ответ.");

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";

        const handleSseEvent = function (eventName, dataText) {
            if (!dataText) return;
            let payload;
            try { payload = JSON.parse(dataText); } catch (error) { return; }

            if (eventName === "player") {
                showPlayerMessage(payload.message);
                setText(elements.systemMessage, "Мастер формирует ответ...");
            } else if (eventName === "delta") {
                showNarrativeDelta(payload.text || "");
            } else if (eventName === "done") {
                completedResult = payload;
            } else if (eventName === "error") {
                throw new Error(payload.error || "Мастер не смог обработать действие.");
            }
        };

        while (true) {
            const chunk = await reader.read();
            if (chunk.done) break;
            buffer += decoder.decode(chunk.value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            for (const line of lines) {
                const trimmed = line.trimEnd();
                if (!trimmed) {
                    currentEvent = "message";
                    continue;
                }
                if (trimmed.startsWith("event:")) currentEvent = trimmed.slice(6).trim();
                else if (trimmed.startsWith("data:")) handleSseEvent(currentEvent, trimmed.slice(5).trim());
            }
        }
        buffer += decoder.decode();
        if (buffer.trim()) {
            for (const line of buffer.split("\n")) {
                if (line.startsWith("event:")) currentEvent = line.slice(6).trim();
                else if (line.startsWith("data:")) handleSseEvent(currentEvent, line.slice(5).trim());
            }
        }

        if (!completedResult || !completedResult.success) {
            throw new Error("Поток ответа завершился раньше времени. Обнови журнал и попробуй ещё раз.");
        }

        showPlayerMessage(completedResult.messages && completedResult.messages.player);
        if (Array.isArray(completedResult.rolls) && completedResult.rolls.length) {
            const rollText = completedResult.rolls.map(roll => "Бросок мастера — " + roll.label + ": d20 (" + roll.dice.join(", ") + ")" + (roll.dice.length > 1 ? ", выбран " + roll.die : "") + " " + (roll.bonus >= 0 ? "+ " : "− ") + Math.abs(roll.bonus) + " = " + roll.total + (roll.dc ? " против СЛ " + roll.dc + (roll.success ? " — успех" : " — неудача") : "") + (roll.death_save_effect ? " (" + roll.death_save_effect + ")" : "")).join("\n");
            appendMessage({ role: "system", content: rollText });
        }
        const finalText = completedResult.result && completedResult.result.text
            ? completedResult.result.text
            : streamingText;

        if (streamingArticle) {
            streamingArticle.querySelector("p").textContent = finalText;
        } else if (finalText) {
            appendMessage({ role: "assistant", content: finalText });
        }

        if (completedResult.state) {
            currentGameState = completedResult.state;
            renderHealth();
            renderGameState();
        }
        if (Array.isArray(completedResult.inventory)) {
            currentInventory = completedResult.inventory;
            renderInventory();
        }

        setSaveStatus("Сохранено");
        setText(elements.systemMessage, "Ответ получен от " +
            ((completedResult.result && completedResult.result.model) || "Gemini") +
            ". Изменения кампании сохранены.");
    } catch (error) {
        console.error("Gemini action error:", error);
        setSaveStatus("Ошибка мастера");
        setText(elements.systemMessage, error.message || "Не удалось связаться с ИИ-мастером.");
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
        await saveMessage("player", "Самостоятельный бросок игрока (не проверка мастера): " + rollText);
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
