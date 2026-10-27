export default {
    async fetch(request, env) {

        const url = new URL(request.url);

        if (
            url.pathname === "/api/game/action" &&
            request.method === "POST"
        ) {
            return handleGameAction(request, env);
        }


        if (
            url.pathname === "/api/health" &&
            request.method === "GET"
        ) {
            return jsonResponse({
                success: true,
                service: "Arcanum API",
                status: "online"
            });
        }


        return env.ASSETS.fetch(request);
    }
};


async function handleGameAction(request, env) {

    try {

        const authorization =
            request.headers.get("Authorization");


        if (!authorization) {

            return jsonResponse(
                {
                    success: false,
                    error: "Authorization required"
                },
                401
            );
        }


        const accessToken =
            authorization.replace(
                "Bearer ",
                ""
            );


        if (!accessToken) {

            return jsonResponse(
                {
                    success: false,
                    error: "Invalid authorization"
                },
                401
            );
        }


        const user =
            await getSupabaseUser(
                env,
                accessToken
            );


        if (!user) {

            return jsonResponse(
                {
                    success: false,
                    error: "Invalid session"
                },
                401
            );
        }


        const body =
            await request.json();


        const campaignId =
            body.campaign_id;


        const characterId =
            body.character_id;


        const action =
            String(body.action || "").trim();


        if (!campaignId) {

            return jsonResponse(
                {
                    success: false,
                    error: "campaign_id is required"
                },
                400
            );
        }


        if (!characterId) {

            return jsonResponse(
                {
                    success: false,
                    error: "character_id is required"
                },
                400
            );
        }


        if (!action) {

            return jsonResponse(
                {
                    success: false,
                    error: "action is required"
                },
                400
            );
        }


        if (action.length > 5000) {

            return jsonResponse(
                {
                    success: false,
                    error: "Action is too long"
                },
                400
            );
        }


        const character =
            await supabaseRequest(
                env,
                accessToken,
                `/rest/v1/characters?select=*&id=eq.${encodeURIComponent(characterId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&user_id=eq.${encodeURIComponent(user.id)}`
            );


        if (!character || character.length === 0) {

            return jsonResponse(
                {
                    success: false,
                    error: "Character not found"
                },
                404
            );
        }


        const gameStates =
            await supabaseRequest(
                env,
                accessToken,
                `/rest/v1/game_states?select=*&character_id=eq.${encodeURIComponent(characterId)}&campaign_id=eq.${encodeURIComponent(campaignId)}&user_id=eq.${encodeURIComponent(user.id)}`
            );


        if (!gameStates || gameStates.length === 0) {

            return jsonResponse(
                {
                    success: false,
                    error: "Game state not found"
                },
                404
            );
        }


        const state =
            gameStates[0];


        await supabaseRequest(
            env,
            accessToken,
            "/rest/v1/game_messages",
            {
                method: "POST",

                headers: {
                    "Prefer": "return=minimal"
                },

                body: {
                    user_id:
                        user.id,

                    campaign_id:
                        campaignId,

                    character_id:
                        characterId,

                    role:
                        "player",

                    content:
                        action
                }
            }
        );


        const roll =
            Math.floor(
                Math.random() * 20
            ) + 1;


        let resultText;


        if (roll === 20) {

            resultText =
                `Критический успех! Ты пытаешься: ${action}`;

        } else if (roll === 1) {

            resultText =
                `Критическая неудача. Твоё действие "${action}" оборачивается неожиданной проблемой.`;

        } else if (roll >= 15) {

            resultText =
                `Успех. Ты предпринимаешь действие: ${action}`;

        } else if (roll >= 8) {

            resultText =
                `Частичный успех. Ты пытаешься: ${action}, но ситуация оказывается сложнее ожидаемого.`;

        } else {

            resultText =
                `Неудача. Попытка "${action}" не даёт ожидаемого результата.`;

        }


        await supabaseRequest(
            env,
            accessToken,
            "/rest/v1/game_messages",
            {
                method: "POST",

                headers: {
                    "Prefer": "return=minimal"
                },

                body: {
                    user_id:
                        user.id,

                    campaign_id:
                        campaignId,

                    character_id:
                        characterId,

                    role:
                        "dm",

                    content:
                        resultText
                }
            }
        );


        return jsonResponse({
            success: true,

            roll,

            result:
                resultText,

            state: {
                current_hp:
                    state.current_hp,

                max_hp:
                    state.max_hp,

                location:
                    state.location,

                game_day:
                    state.game_day,

                game_time:
                    state.game_time,

                experience:
                    state.experience,

                gold:
                    state.gold
            }
        });


    } catch (error) {

        console.error(error);


        return jsonResponse(
            {
                success: false,

                error:
                    error.message ||
                    "Internal server error"
            },
            500
        );
    }
}


async function getSupabaseUser(
    env,
    accessToken
) {

    const response =
        await fetch(
            `${env.SUPABASE_URL}/auth/v1/user`,
            {
                method: "GET",

                headers: {
                    "apikey":
                        env.SUPABASE_ANON_KEY,

                    "Authorization":
                        `Bearer ${accessToken}`
                }
            }
        );


    if (!response.ok) {

        return null;
    }


    return response.json();
}


async function supabaseRequest(
    env,
    accessToken,
    path,
    options = {}
) {

    const headers = {

        "apikey":
            env.SUPABASE_ANON_KEY,

        "Authorization":
            `Bearer ${accessToken}`,

        "Content-Type":
            "application/json",

        ...(options.headers || {})
    };


    const requestOptions = {

        method:
            options.method || "GET",

        headers
    };


    if (options.body !== undefined) {

        requestOptions.body =
            JSON.stringify(
                options.body
            );
    }


    const response =
        await fetch(
            `${env.SUPABASE_URL}${path}`,
            requestOptions
        );


    if (!response.ok) {

        const errorText =
            await response.text();


        throw new Error(
            `Supabase error ${response.status}: ${errorText}`
        );
    }


    const text =
        await response.text();


    if (!text) {

        return null;
    }


    return JSON.parse(text);
}


function jsonResponse(
    data,
    status = 200
) {

    return new Response(
        JSON.stringify(data),
        {
            status,

            headers: {
                "Content-Type":
                    "application/json",

                "Cache-Control":
                    "no-store"
            }
        }
    );
}
