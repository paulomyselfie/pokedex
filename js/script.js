const TOTAL_FEATURED = 5;
const TOTAL_STANDARD = 10; 
const LEGENDARY_IDS = [144, 145, 146, 150, 151, 243, 244, 245, 249, 250, 251, 377, 378, 379, 380, 381, 382, 383, 384, 385, 386];

// ====== 1. DICIONÁRIO DE CORREÇÃO LOCAL (FALLBACK SEGURO) ======
const POKEMON_LOCAL_DB = {
    1: { name: "Bulbasaur", types: ["planta", "veneno"], stage: 1, nextEvoId: 2 },
    2: { name: "Ivysaur", types: ["planta", "veneno"], stage: 2, nextEvoId: 3 },
    3: { name: "Venusaur", types: ["planta", "veneno"], stage: 3, nextEvoId: null },
    4: { name: "Charmander", types: ["fogo"], stage: 1, nextEvoId: 5 },
    5: { name: "Charmeleon", types: ["fogo"], stage: 2, nextEvoId: 6 },
    6: { name: "Charizard", types: ["fogo", "voador"], stage: 3, nextEvoId: null },
    7: { name: "Squirtle", types: ["água"], stage: 1, nextEvoId: 8 },
    8: { name: "Wartortle", types: ["água"], stage: 2, nextEvoId: 9 },
    9: { name: "Blastoise", types: ["água"], stage: 3, nextEvoId: null },
    25: { name: "Pikachu", types: ["elétrico"], stage: 1, nextEvoId: 26 },
    26: { name: "Raichu", types: ["elétrico"], stage: 2, nextEvoId: null },
    39: { name: "Jigglypuff", types: ["normal", "fada"], stage: 1, nextEvoId: 40 },
    40: { name: "Wigglytuff", types: ["normal", "fada"], stage: 2, nextEvoId: null }
};

// ====== 2. VARIÁVEIS DE ESTADO (PERSISTÊNCIA) ======
let timeAtivo = new Array(TOTAL_FEATURED).fill(null);
let pcBoxes = [ { nome: "Box 1", slots: new Array(TOTAL_STANDARD).fill(null) } ];
let caixaAtualIndex = 0;
let selectedIndex = null;
let selectedTipo = null; 
let bagasCount = 5;
let currentBoxAction = null; 
let confirmCallback = null; 

document.addEventListener("DOMContentLoaded", () => {
    carregarDadosLocais();
    verificarInicialEBonus();
    atualizarSelectBoxes();
    renderGrids();
    atualizarHeaderBagas();
    repararPokemonsQuebrados().catch(e => console.warn("Falha ao reparar Pokémon salvos.", e));
});

// ====== 3. SISTEMA DE ALERTAS ======
function mostrarAlerta(titulo, msg) {
    document.getElementById('alertTitle').innerText = titulo;
    document.getElementById('alertMessage').innerText = msg;
    document.getElementById('customAlertModal').classList.remove('hidden');
}
function fecharAlerta() { document.getElementById('customAlertModal').classList.add('hidden'); }
function mostrarConfirmacao(titulo, msg, callback) {
    document.getElementById('confirmTitle').innerText = titulo;
    document.getElementById('confirmMessage').innerText = msg;
    confirmCallback = callback;
    document.getElementById('customConfirmModal').classList.remove('hidden');
}
function fecharConfirmacao() { document.getElementById('customConfirmModal').classList.add('hidden'); confirmCallback = null; }
function confirmarAcao() { if (confirmCallback) confirmCallback(); fecharConfirmacao(); }

// ====== 4. CONSUMO DE API E LÓGICA DE EVOLUÇÃO BLINDADA ======
function formatarNomePokemon(str, rawId) {
    if (!str || str.trim() === "") return `Pokémon #${rawId}`;
    return str.replace(/-/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

function traduzirTipo(tipo) {
    const mapa = { fire: "fogo", water: "água", grass: "planta", electric: "elétrico", poison: "veneno", flying: "voador", bug: "inseto", normal: "normal", ground: "terrestre", rock: "pedra", psychic: "psíquico", ice: "gelo", dragon: "dragão", ghost: "fantasma", dark: "sombrio", steel: "aço", fairy: "fada", fighting: "lutador" };
    return mapa[tipo.toLowerCase()] || tipo;
}

// Busca JSON com timeout próprio por tentativa e retry. Retorna null se tudo falhar.
async function fetchJSON(url, tentativas = 2, timeoutMs = 8000) {
    for (let i = 0; i < tentativas; i++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { signal: controller.signal });
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`Tentativa ${i + 1} falhou para ${url}`, e);
        } finally {
            clearTimeout(timeoutId);
        }
    }
    return null;
}

// Procura o Pokémon na cadeia evolutiva: devolve o estágio dele e TODAS as evoluções possíveis (até a Gen 3).
function idDaEspecie(node) {
    const parts = node.species.url.split('/').filter(Boolean);
    return parseInt(parts[parts.length - 1]);
}

function acharEvolucao(node, targetName, stage) {
    if (node.species.name === targetName) {
        const opcoes = (node.evolves_to || []).map(idDaEspecie).filter(id => id >= 1 && id <= 386);
        return { options: opcoes, stage: stage };
    }
    for (const child of (node.evolves_to || [])) {
        const result = acharEvolucao(child, targetName, stage + 1);
        if (result) return result;
    }
    return null;
}

// Remove o cache de versões antigas do jogo (que não tinham a lista de evoluções).
function limparCacheAntigo() {
    try {
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith('pokedex_cache_v27_')) localStorage.removeItem(k);
        }
    } catch (e) { /* sem localStorage: segue sem cache */ }
}

// Busca e resume os dados da PokéAPI. Só guarda em cache se veio COMPLETO (com evolução).
// `rapido`: usado pros Pokémon do dicionário local, que não dependem da API (1 tentativa, timeout curto).
async function buscarDadosAPI(idNum, rapido = false) {
    const cacheKey = `pokedex_cache_v28_${idNum}`;
    try {
        const emCache = localStorage.getItem(cacheKey);
        if (emCache) {
            const c = JSON.parse(emCache);
            if (c && Array.isArray(c.evoOptions)) return c;
        }
    } catch (e) { /* cache ilegível: ignora e busca de novo */ }

    const [tentativas, timeout] = rapido ? [1, 3500] : [2, 8000];
    const [data, species] = await Promise.all([
        fetchJSON(`https://pokeapi.co/api/v2/pokemon/${idNum}`, tentativas, timeout),
        fetchJSON(`https://pokeapi.co/api/v2/pokemon-species/${idNum}`, tentativas, timeout)
    ]);
    if (!data || !species) return null;

    const chain = species.evolution_chain ? await fetchJSON(species.evolution_chain.url, tentativas, timeout) : null;
    const evo = chain ? acharEvolucao(chain.chain, species.name, 1) : null;

    const s = data.stats || [];
    const info = {
        name: formatarNomePokemon(data.name, idNum),
        types: data.types.map(t => traduzirTipo(t.type.name)),
        height: data.height ? (data.height / 10).toFixed(1) : "1.0",
        weight: data.weight ? (data.weight / 10).toFixed(1) : "10.0",
        stats: {
            hp: s[0]?.base_stat || 50, attack: s[1]?.base_stat || 50, defense: s[2]?.base_stat || 50,
            spAtk: s[3]?.base_stat || 50, spDef: s[4]?.base_stat || 50, speed: s[5]?.base_stat || 50
        },
        shinyImage: data.sprites?.other?.['official-artwork']?.front_shiny || null,
        isLegendary: !!(species.is_legendary || species.is_mythical),
        isBase: !species.evolves_from_species,
        evoOk: !!evo,
        evoOptions: evo ? evo.options : [],
        stage: evo ? evo.stage : 1
    };

    if (info.evoOk) {
        try { localStorage.setItem(cacheKey, JSON.stringify(info)); } catch (e) { /* sem espaço: tudo bem */ }
    }
    return info;
}

// Devolve o Pokémon completo, ou null se não der pra montar com dados confiáveis.
// (Nunca devolve "Pokémon #xxx" nem "nível máx." falso: quem chama trata o null.)
async function fetchPokemonFromAPIOrDatabase(idNum, isShiny = false) {
    const local = POKEMON_LOCAL_DB[idNum] || null;
    const info = await buscarDadosAPI(idNum, !!local);

    // Fora do dicionário local, precisamos da API COMPLETA (nome, tipos e evolução).
    if (!local && (!info || !info.evoOk)) return null;

    const nome = local ? local.name : info.name;
    const tipos = local ? local.types : info.types;
    const stage = local ? local.stage : info.stage;
    const evoOptions = local ? (local.nextEvoId ? [local.nextEvoId] : []) : info.evoOptions;

    let image = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${idNum}.png`;
    if (isShiny) {
        image = (info && info.shinyImage) ||
            `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/shiny/${idNum}.png`;
    }

    return {
        id: String(idNum).padStart(3, '0'), rawId: idNum, name: nome,
        image: image, types: tipos,
        height: info ? info.height : "1.0", weight: info ? info.weight : "10.0",
        stage: stage, nextEvoId: evoOptions.length ? evoOptions[0] : null, evoOptions: evoOptions,
        isShiny: isShiny,
        formaBase: local ? local.stage === 1 : info.isBase,
        isLegendary: (info ? info.isLegendary : false) || LEGENDARY_IDS.includes(idNum),
        alimentacoes: 0,
        stats: info ? info.stats : { hp: 50, attack: 50, defense: 50, spAtk: 50, spDef: 50, speed: 50 }
    };
}


// ====== 5. MANIPULAÇÃO DO DOM E DUMP ======
function atualizarSelectBoxes() {
    const sel = document.getElementById('boxSelect');
    if(!sel) return;
    sel.innerHTML = '';
    pcBoxes.forEach((box, idx) => {
        const opt = document.createElement('option');
        opt.value = idx; opt.innerText = box.nome;
        if(idx === caixaAtualIndex) opt.selected = true;
        sel.appendChild(opt);
    });
}

function mudarBox() {
    const sel = document.getElementById('boxSelect');
    if(!sel) return;
    caixaAtualIndex = parseInt(sel.value);
    selectedIndex = null; selectedTipo = null;
    renderGrids();
}

function abrirModalCriarBox() {
    currentBoxAction = 'create';
    document.getElementById('boxModalTitle').innerText = "Criar Nova Box";
    document.getElementById('boxModalInput').value = "";
    document.getElementById('boxInputModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('boxModalInput').focus(), 100);
}

function abrirModalRenomearBox() {
    if (!pcBoxes[caixaAtualIndex]) return;
    currentBoxAction = 'rename';
    document.getElementById('boxModalTitle').innerText = "Renomear Box Atual";
    document.getElementById('boxModalInput').value = pcBoxes[caixaAtualIndex].nome;
    document.getElementById('boxInputModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('boxModalInput').focus(), 100);
}

function fecharBoxModal() { document.getElementById('boxInputModal').classList.add('hidden'); }

function confirmarBoxModal() {
    const inputField = document.getElementById('boxModalInput');
    const nomeFormated = inputField.value.trim();
    
    if (nomeFormated !== "") {
        if (currentBoxAction === 'create') {
            pcBoxes.push({ nome: nomeFormated, slots: new Array(TOTAL_STANDARD).fill(null) });
            caixaAtualIndex = pcBoxes.length - 1;
            selectedIndex = null; selectedTipo = null;
        } else if (currentBoxAction === 'rename') {
            pcBoxes[caixaAtualIndex].nome = nomeFormated;
        }
        atualizarSelectBoxes(); salvarDados(); renderGrids();
    }
    fecharBoxModal();
}

document.addEventListener("keydown", function(event) {
    if (event.key === "Enter" && !document.getElementById('boxInputModal').classList.contains('hidden')) { confirmarBoxModal(); }
});

function apagarBox() {
    if (pcBoxes.length <= 1) return mostrarAlerta("Erro!", "Você precisa ter pelo menos uma Box no PC!");
    mostrarConfirmacao("Apagar Box?", `Tem certeza que deseja apagar a ${pcBoxes[caixaAtualIndex].nome}? Todos os Pokémon nela serão libertados para a natureza!`, () => {
        pcBoxes.splice(caixaAtualIndex, 1);
        caixaAtualIndex = 0; selectedIndex = null; selectedTipo = null;
        atualizarSelectBoxes(); salvarDados(); renderGrids();
    });
}

// ====== LÓGICA DO INICIAL BLINDADA ======
async function escolherInicial(numId) {
    const idLimpo = parseInt(numId);
    document.body.style.cursor = "wait";
    
    try {
        const poke = await fetchPokemonFromAPIOrDatabase(idLimpo, false);
        if (!poke) throw new Error("Falha ao buscar inicial");

        timeAtivo[0] = poke;
        localStorage.setItem('pokedex_starter_v26', 'true'); // Chave padronizada v26
        salvarDados();
        
        const modal = document.getElementById('starterModal');
        if (modal) modal.classList.add('hidden');
        
        selectedIndex = 0; selectedTipo = 'time';
        renderGrids();
        verificarInicialEBonus();
    } catch (e) {
        mostrarAlerta("Erro de Conexão", "Falha ao puxar o Pokémon. Tente clicar novamente!");
    } finally {
        document.body.style.cursor = "default";
    }
}

// ====== SORTEIO ALEATÓRIO (SÓ FORMA BASE OU LENDÁRIO) ======
let sorteando = false; // trava o sorteio (a Pokébola e o botão chamam a mesma função)

function acharSlotLivre() {
    let idx = timeAtivo.findIndex(item => item === null);
    if (idx !== -1) return { destino: 'time', index: idx };
    idx = pcBoxes[caixaAtualIndex].slots.findIndex(item => item === null);
    if (idx !== -1) return { destino: 'box', index: idx };
    return null;
}

function mostrarCelebracao(poke) {
    const shiny = poke.isShiny, lendario = poke.isLegendary;
    const gradiente = (lendario && !shiny) ? "from-purple-300 to-indigo-500" : "from-amber-200 to-amber-500";
    document.getElementById('celebrationCard').className = `bg-gradient-to-br ${gradiente} rounded-3xl max-w-sm w-full p-6 text-center shadow-2xl transform scale-105 transition-transform border-4 border-white relative overflow-hidden`;
    document.getElementById('celebrationIcon').innerText = shiny && lendario ? '🌟' : (shiny ? '✨' : '👑');
    document.getElementById('celebrationTitle').innerText = shiny && lendario ? 'Shiny Lendário!' : (shiny ? 'Pokémon Shiny!' : 'Pokémon Lendário!');
    document.getElementById('celebrationDesc').innerText = shiny && lendario
        ? `Incrível! Você capturou ${poke.name}, lendário E shiny!`
        : (shiny ? `Você capturou um ${poke.name} shiny, super raro!` : `Você capturou ${poke.name}, um Pokémon lendário!`);
    const img = document.getElementById('celebrationImg');
    img.src = poke.image; img.alt = poke.name;
    document.getElementById('celebrationModal').classList.remove('hidden');
}
function fecharCelebracao() { document.getElementById('celebrationModal').classList.add('hidden'); }

async function sortearPokemon() {
    if (sorteando) return;
    if (!acharSlotLivre()) return mostrarAlerta("Espaço Insuficiente", `O Time Ativo e a Box '${pcBoxes[caixaAtualIndex].nome}' estão totalmente cheios! Crie uma Box Nova ou solte algum Pokémon.`);

    sorteando = true;
    const btnSortear = document.getElementById("btnSortear");
    const btnTexto = document.getElementById("btnSortearText");
    const loader = document.getElementById("loaderIcon");
    const pb = document.getElementById("pokeballGraphic");
    const pCard = document.getElementById("pokemonCard");

    if (btnSortear) btnSortear.disabled = true;
    if (btnTexto) btnTexto.innerText = "SORTEANDO...";
    if (loader) loader.classList.remove("hidden");
    if (pb) { pb.classList.remove("hidden"); pb.classList.add("shake-anim"); }
    if (pCard) pCard.classList.add("hidden");

    try {
        const isShiny = Math.random() < 0.05;
        let novoPokemon = null;

        // Só entram formas base (ou lendários, que já são o máximo). Busca 3 candidatos por vez, em paralelo.
        for (let rodada = 0; rodada < 4 && !novoPokemon; rodada++) {
            const ids = [];
            while (ids.length < 3) {
                const id = Math.floor(Math.random() * 386) + 1;
                if (!ids.includes(id)) ids.push(id);
            }
            const resultados = await Promise.all(ids.map(id => fetchPokemonFromAPIOrDatabase(id, isShiny)));
            novoPokemon = resultados.find(p => p && (p.formaBase || p.isLegendary)) || null;
            if (resultados.every(p => !p)) break; // API fora do ar: não adianta insistir
        }

        if (pb) pb.classList.remove("shake-anim");

        if (!novoPokemon) {
            return mostrarAlerta("Erro de Conexão", "Não foi possível buscar um Pokémon agora. Tente sortear de novo.");
        }

        // Procura o slot livre DEPOIS da espera (o jogador pode ter mexido nos slots).
        const alvo = acharSlotLivre();
        if (!alvo) {
            return mostrarAlerta("Espaço Insuficiente", "Os slots encheram enquanto o Pokémon era buscado. Libere espaço e sorteie de novo.");
        }

        if (pb) pb.classList.add("hidden");
        if (pCard) pCard.classList.remove("hidden");

        document.getElementById("pokemonImg").src = novoPokemon.image;
        document.getElementById("pokemonNumber").innerText = `#${novoPokemon.id}`;

        let badges = (novoPokemon.isShiny ? '✨ ' : '') + (novoPokemon.isLegendary ? '👑 ' : '');
        document.getElementById("pokemonName").innerText = `${badges}${novoPokemon.name}`;
        document.getElementById("pokemonTypes").innerHTML = novoPokemon.types.map(t => `<span class="text-[9px] font-bold uppercase bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">${t}</span>`).join('');

        if (alvo.destino === 'time') timeAtivo[alvo.index] = novoPokemon;
        else pcBoxes[caixaAtualIndex].slots[alvo.index] = novoPokemon;
        selectedIndex = alvo.index; selectedTipo = alvo.destino;

        salvarDados();
        renderGrids();

        if (novoPokemon.isShiny || novoPokemon.isLegendary) mostrarCelebracao(novoPokemon);
    } finally {
        // Garante que tudo destrava independentemente de sucesso ou erro na API
        sorteando = false;
        if (btnSortear) btnSortear.disabled = false;
        if (btnTexto) btnTexto.innerText = "SORTEAR";
        if (loader) loader.classList.add("hidden");
    }
}

// ====== PERSISTÊNCIA DUMP (LOCALSTORAGE JSON) ======
function carregarDadosLocais() {
    limparCacheAntigo();
    try {
        const savedTime = JSON.parse(localStorage.getItem('pokedex_v26_time'));
        const savedBoxes = JSON.parse(localStorage.getItem('pokedex_v26_boxes'));
        const pokeOk = p => p === null || (p && typeof p === 'object' && p.id && p.name);
        const timeOk = Array.isArray(savedTime) && savedTime.length === TOTAL_FEATURED && savedTime.every(pokeOk);
        const boxesOk = Array.isArray(savedBoxes) && savedBoxes.length > 0 && savedBoxes.every(b =>
            b && typeof b.nome === 'string' && Array.isArray(b.slots) && b.slots.length === TOTAL_STANDARD && b.slots.every(pokeOk));
        // Só aceita os dois juntos: nunca mistura dados salvos com dados novos.
        if (timeOk && boxesOk) { timeAtivo = savedTime; pcBoxes = savedBoxes; }
        else if (savedTime || savedBoxes) console.warn("Dados salvos inválidos: iniciando coleção vazia.");
    } catch (e) { console.error("JSON corrompido, reiniciando dados.", e); }

    const berries = parseInt(localStorage.getItem('pokedex_v26_berries'), 10);
    if (!isNaN(berries)) bagasCount = Math.max(0, berries);
}

function salvarDados() {
    localStorage.setItem('pokedex_v26_time', JSON.stringify(timeAtivo));
    localStorage.setItem('pokedex_v26_boxes', JSON.stringify(pcBoxes));
    localStorage.setItem('pokedex_v26_berries', bagasCount.toString());
}

function verificarInicialEBonus() {
    const starter = localStorage.getItem('pokedex_starter_v26');
    const hasPoke = timeAtivo.some(p => p !== null) || pcBoxes.some(box => box.slots.some(p => p !== null));

    if (!starter && !hasPoke) { document.getElementById('starterModal').classList.remove('hidden'); return; }
    
    const hoje = new Date().toDateString();
    if (localStorage.getItem('pokedex_last_login_v26') !== hoje) {
        bagasCount += 5;
        localStorage.setItem('pokedex_last_login_v26', hoje);
        salvarDados();
        document.getElementById('welcomeModal').classList.remove('hidden');
    }
}

function fecharModalBonus() { document.getElementById('welcomeModal').classList.add('hidden'); atualizarHeaderBagas(); }
function atualizarHeaderBagas() { document.getElementById('berryCountDisplay').innerText = bagasCount; }

function renderGrids() {
    const feat = document.getElementById("featuredGrid");
    const std = document.getElementById("standardGrid");
    if (feat) feat.innerHTML = ""; if (std) std.innerHTML = "";

    for (let i = 0; i < TOTAL_FEATURED; i++) {
        const poke = timeAtivo[i];
        const isSelected = selectedTipo === 'time' && selectedIndex === i;
        const slot = document.createElement("div");
        
        let vClass = "";
        if (isSelected) {
            vClass = 'border-pokeRed ring-2 ring-pokeRed/40 bg-red-50/40 scale-105 z-10 shadow-md';
        } else if (poke) {
            if (poke.isShiny && poke.isLegendary) vClass = 'border-pink-500 bg-gradient-to-br from-amber-100 to-pink-100 shadow-amber-200';
            else if (poke.isShiny) vClass = 'border-amber-400 bg-amber-50/80 shadow-amber-100';
            else if (poke.isLegendary) vClass = 'border-purple-500 bg-purple-50/60';
            else vClass = 'border-pokeTealDark bg-teal-50/20';
        } else {
            vClass = 'border-slate-200/70 bg-slate-50';
        }

        slot.className = `slot-card featured-slot aspect-[4/5] rounded-xl border-2 transition-all cursor-pointer hover:-translate-y-0.5 flex flex-col items-center justify-center p-1 relative overflow-hidden ${vClass}`;
        if (poke) {
            slot.onclick = () => selecionarSlot('time', i);
            let badges = (poke.isShiny ? '✨' : '') + (poke.isLegendary ? '👑' : '');
            slot.innerHTML = `<span class="absolute top-1 left-1 text-[9px] font-bold text-slate-500">#${poke.id} ${badges}</span><span class="absolute top-1 right-1 text-[8px] font-extrabold bg-pokeGreen text-white px-1 rounded-full">${poke.alimentacoes || 0}/3</span><img src="${poke.image}" alt="${poke.name}" class="w-full h-full object-contain p-1 drop-shadow-sm">`;
        } else {
            slot.onclick = () => selecionarSlot('time', i);
            slot.innerHTML = `<div class="w-2 h-2 rounded-full bg-slate-300"></div>`;
        }
        if (feat) feat.appendChild(slot);
    }

    const boxSlots = pcBoxes[caixaAtualIndex].slots;
    for (let i = 0; i < TOTAL_STANDARD; i++) {
        const poke = boxSlots[i];
        const isSelected = selectedTipo === 'box' && selectedIndex === i;
        const slot = document.createElement("div");

        let vClass = "";
        if (isSelected) {
            vClass = 'ring-2 ring-pokeRed border-pokeRed bg-slate-700 scale-105 z-10 shadow-md';
        } else if (poke) {
            if (poke.isShiny && poke.isLegendary) vClass = 'border-pink-500 bg-gradient-to-br from-amber-900 to-purple-900';
            else if (poke.isShiny) vClass = 'border-amber-400 bg-slate-800';
            else if (poke.isLegendary) vClass = 'border-purple-400 bg-slate-800';
            else vClass = 'bg-slate-800 border-slate-600';
        } else {
            vClass = 'bg-pokeSlotDark border-slate-700';
        }

        slot.className = `slot-card aspect-square rounded-xl border-2 transition-all cursor-pointer hover:-translate-y-0.5 flex flex-col items-center justify-center p-1 relative overflow-hidden ${vClass}`;
        if (poke) {
            slot.onclick = () => selecionarSlot('box', i);
            let badges = (poke.isShiny ? '✨' : '') + (poke.isLegendary ? '👑' : '');
            slot.innerHTML = `<span class="absolute top-1 left-1 text-[9px] font-bold text-slate-400">#${poke.id} ${badges}</span><span class="absolute top-1 right-1 text-[8px] font-extrabold bg-pokeGreen text-white px-1 rounded-full">${poke.alimentacoes || 0}/3</span><img src="${poke.image}" alt="${poke.name}" class="w-full h-full object-contain p-1 drop-shadow-sm">`;
        } else {
            slot.onclick = () => selecionarSlot('box', i);
            slot.innerHTML = `<div class="w-1.5 h-1.5 rounded-full bg-slate-500/40"></div>`;
        }
        if (std) std.appendChild(slot);
    }

    let totalGeral = timeAtivo.filter(p => p !== null).length;
    pcBoxes.forEach(b => totalGeral += b.slots.filter(p => p !== null).length);
    if (document.getElementById("counter")) document.getElementById("counter").innerText = `${totalGeral} Pokémon`;
    atualizarPainelSelecionado();
}

function selecionarSlot(tipo, index) { selectedTipo = tipo; selectedIndex = index; renderGrids(); }
function getPokemonSelecionado() {
    if (selectedTipo === 'time') return timeAtivo[selectedIndex];
    if (selectedTipo === 'box') return pcBoxes[caixaAtualIndex].slots[selectedIndex];
    return null;
}
function setPokemonSelecionado(pokeObj) {
    if (selectedTipo === 'time') timeAtivo[selectedIndex] = pokeObj;
    else if (selectedTipo === 'box') pcBoxes[caixaAtualIndex].slots[selectedIndex] = pokeObj;
}

function atualizarPainelSelecionado() {
    const poke = getPokemonSelecionado();
    const ui = {
        img: document.getElementById("selectedImg"), name: document.getElementById("selectedName"),
        status: document.getElementById("selectedStatus"), stage: document.getElementById("selectedStage"),
        actions: document.getElementById("actionButtons"), feedCounter: document.getElementById("feedCounter"),
        btnFeed: document.getElementById("btnFeed"), btnFeedLabel: document.getElementById("btnFeedLabel"), btnMove: document.getElementById("btnMove"),
        panelContainer: document.getElementById("selectedPanel")
    };

    if (selectedIndex !== null && poke) {
        if (ui.img) ui.img.src = poke.image;
        let badges = (poke.isShiny ? '✨ ' : '') + (poke.isLegendary ? '👑 ' : '');
        if (ui.name) ui.name.innerText = `#${poke.id} ${badges}${poke.name}`;
        
        let tiposFormatados = poke.types ? poke.types.map(t => `<span class="bg-slate-200 text-slate-700 font-bold text-[9px] uppercase px-2 py-0.5 rounded-full">${t}</span>`).join(' ') : 'normal';
        if (ui.status) ui.status.innerHTML = `Tipos: ${tiposFormatados} | ${selectedTipo === 'time' ? 'Time Ativo' : pcBoxes[caixaAtualIndex].nome}`;
        
        if (ui.stage) { ui.stage.innerText = `Estágio ${poke.stage || 1}`; ui.stage.classList.remove("hidden"); }

        if (ui.panelContainer) {
            if (poke.isShiny && poke.isLegendary) ui.panelContainer.className = "bg-gradient-to-r from-amber-50 to-pink-50 border-2 border-amber-300 rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3 shadow-sm";
            else if (poke.isShiny) ui.panelContainer.className = "bg-amber-50/70 border-2 border-amber-300 rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3 shadow-sm";
            else if (poke.isLegendary) ui.panelContainer.className = "bg-purple-50/70 border-2 border-purple-300 rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3 shadow-sm";
            else ui.panelContainer.className = "bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3 shadow-sm";
        }

        if (poke.nextEvoId === null) {
            if (ui.btnFeedLabel) ui.btnFeedLabel.innerText = "⭐ Nível Máx.";
            if (ui.feedCounter) ui.feedCounter.classList.add("hidden");
            if (ui.btnFeed) { ui.btnFeed.disabled = true; ui.btnFeed.classList.add("opacity-60", "cursor-not-allowed"); }
        } else {
            if (ui.btnFeedLabel) ui.btnFeedLabel.innerText = "🍎 Alimentar";
            if (ui.feedCounter) { ui.feedCounter.innerText = `${poke.alimentacoes || 0}/3`; ui.feedCounter.classList.remove("hidden"); }
            if (ui.btnFeed) { ui.btnFeed.disabled = false; ui.btnFeed.classList.remove("opacity-60", "cursor-not-allowed"); }
        }

        if (ui.btnMove) ui.btnMove.innerText = selectedTipo === 'time' ? "⇄ Mover p/ PC" : "⇄ Mover p/ Time";
        if (ui.actions) ui.actions.classList.remove("hidden");
    } else {
        if (ui.panelContainer) ui.panelContainer.className = "bg-slate-50 border border-slate-200 rounded-2xl p-4 mb-4 flex items-center justify-between flex-wrap gap-3 shadow-sm";
        if (ui.img) ui.img.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
        if (ui.name) ui.name.innerText = "Selecione um Pokémon";
        if (ui.status) ui.status.innerText = "Clique num slot.";
        if (ui.stage) ui.stage.classList.add("hidden");
        if (ui.actions) ui.actions.classList.add("hidden");
    }
}

let evoluindo = false; // trava cliques enquanto uma evolução está sendo buscada

async function alimentarPokemon() {
    if (evoluindo) return;
    const poke = getPokemonSelecionado();
    if (!poke || poke.nextEvoId === null) return;
    if (bagasCount <= 0) return mostrarAlerta("Sem Bagas!", "Você ficou sem bagas! Volte amanhã para receber o seu bônus diário de 5 Bagas grátis.");

    bagasCount--; poke.alimentacoes = (poke.alimentacoes || 0) + 1; atualizarHeaderBagas();
    salvarDados();

    if (poke.alimentacoes >= 3) { await evoluirPokemon(poke); }
    else { renderGrids(); }
}

async function evoluirPokemon(poke) {
    if (poke.nextEvoId === null) {
        mostrarAlerta("Nível Máximo", "Este Pokémon não pode evoluir mais.");
        return;
    }

    evoluindo = true;
    try {
        const img = document.getElementById("selectedImg");
        img.classList.add("evolve-anim");
        setTimeout(() => img.classList.remove("evolve-anim"), 1200);

        // Evolução ramificada (Eevee, Poliwhirl...): sorteia uma das evoluções possíveis.
        const opcoes = (Array.isArray(poke.evoOptions) && poke.evoOptions.length) ? poke.evoOptions : [poke.nextEvoId];
        const alvoId = opcoes[Math.floor(Math.random() * opcoes.length)];
        const data = await fetchPokemonFromAPIOrDatabase(alvoId, poke.isShiny);

        if (!data) {
            // API falhou: devolve a baga e deixa o Pokémon pronto pra tentar de novo.
            bagasCount++; poke.alimentacoes = 2; atualizarHeaderBagas();
            salvarDados(); renderGrids();
            return mostrarAlerta("Erro de Conexão", "Não foi possível evoluir agora. Sua baga foi devolvida, tente alimentar de novo.");
        }

        // O objeto `poke` já está no slot certo (mesma referência): atualiza ele mesmo,
        // sem usar o slot selecionado, que pode ter mudado durante a espera.
        poke.alimentacoes = 0;
        poke.id = data.id; poke.rawId = data.rawId; poke.name = data.name; poke.image = data.image; poke.types = data.types;
        poke.height = data.height; poke.weight = data.weight; poke.stage = data.stage; poke.nextEvoId = data.nextEvoId;
        poke.evoOptions = data.evoOptions; poke.stats = data.stats;

        salvarDados(); renderGrids();
    } finally {
        evoluindo = false;
    }
}

// Conserta Pokémon que ficaram salvos quebrados por falha da API ("Pokémon #xxx" ou sem a lista de evoluções).
async function repararPokemonsQuebrados() {
    const todos = [...timeAtivo, ...pcBoxes.flatMap(b => b.slots)].filter(p => p);
    const candidatos = todos.filter(p => Number.isInteger(p.rawId) && !POKEMON_LOCAL_DB[p.rawId] &&
        (String(p.name).startsWith("Pokémon #") || !Array.isArray(p.evoOptions)));

    let mudou = false;
    for (const p of candidatos) {
        const data = await fetchPokemonFromAPIOrDatabase(p.rawId, p.isShiny);
        if (!data) continue; // API fora: tenta de novo na próxima vez que abrir a página
        p.name = data.name; p.image = data.image; p.types = data.types; p.height = data.height; p.weight = data.weight;
        p.stage = data.stage; p.nextEvoId = data.nextEvoId; p.evoOptions = data.evoOptions;
        p.stats = data.stats; p.isLegendary = data.isLegendary;
        mudou = true;
    }
    if (mudou) { salvarDados(); renderGrids(); }
}

function moverPokemon() {
    const poke = getPokemonSelecionado();
    if (!poke) return;

    if (selectedTipo === 'time') {
        let alvoIndex = pcBoxes[caixaAtualIndex].slots.findIndex(s => s === null);
        if (alvoIndex !== -1) {
            pcBoxes[caixaAtualIndex].slots[alvoIndex] = poke;
            timeAtivo[selectedIndex] = null;
            selectedTipo = 'box'; selectedIndex = alvoIndex;
        } else { return mostrarAlerta("Box Cheia", `Não há espaço livre! A Box '${pcBoxes[caixaAtualIndex].nome}' está totalmente cheia!`); }
    } else {
        let alvoIndex = timeAtivo.findIndex(s => s === null);
        if (alvoIndex !== -1) {
            timeAtivo[alvoIndex] = poke;
            pcBoxes[caixaAtualIndex].slots[selectedIndex] = null;
            selectedTipo = 'time'; selectedIndex = alvoIndex;
        } else { return mostrarAlerta("Time Cheio", "Seu Time Ativo já tem 5 Pokémon! Mova um deles para o PC primeiro."); }
    }
    salvarDados(); renderGrids();
}

function abrirModalDetalhes() {
    const poke = getPokemonSelecionado();
    if (!poke) return;

    let badges = (poke.isShiny ? '✨ ' : '') + (poke.isLegendary ? '👑 ' : '');
    document.getElementById('modalTitle').innerHTML = `${badges}${poke.name}`;
    document.getElementById('modalCategory').innerText = `${poke.types.join(' / ')} Pokémon`;
    document.getElementById('modalId').innerText = `#${poke.id}`;
    document.getElementById('modalHeight').innerText = `${poke.height || '0.7'} m`;
    document.getElementById('modalWeight').innerText = `${poke.weight || '6.9'} kg`;
    document.getElementById('modalImg').src = poke.image;
    document.getElementById('modalTypes').innerHTML = poke.types.map(t => `<span class="bg-indigo-500 text-white font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-md">${t}</span>`).join('');

    const bgGlow = document.getElementById('modalImgBgGlow');
    if(poke.isShiny && poke.isLegendary) bgGlow.className = "absolute inset-0 rounded-2xl opacity-30 bg-gradient-to-tr from-pink-400 to-purple-500";
    else if(poke.isShiny) bgGlow.className = "absolute inset-0 rounded-2xl opacity-30 bg-gradient-to-tr from-amber-300 to-yellow-500";
    else if(poke.isLegendary) bgGlow.className = "absolute inset-0 rounded-2xl opacity-20 bg-gradient-to-tr from-indigo-500 to-blue-500";
    else bgGlow.className = "hidden";

    const stats = poke.stats || { hp: 50, attack: 50, defense: 50, spAtk: 50, spDef: 50, speed: 50 };
    const setStat = (valId, barId, val) => {
        document.getElementById(valId).innerText = val;
        document.getElementById(barId).style.width = `${Math.min(100, Math.round((val / 160) * 100))}%`;
    };
    
    setStat('statHpVal', 'statHpBar', stats.hp); setStat('statAtkVal', 'statAtkBar', stats.attack); setStat('statDefVal', 'statDefBar', stats.defense); 
    setStat('statSpAtkVal', 'statSpAtkBar', stats.spAtk); setStat('statSpDefVal', 'statSpDefBar', stats.spDef); setStat('statSpdVal', 'statSpdBar', stats.speed);

    document.getElementById('modalEvoChain').innerHTML = `
        <span class="bg-slate-100 text-slate-700 border font-bold text-xs px-3 py-1 rounded-lg uppercase">${poke.name}</span>
        <span class="text-slate-400 font-bold">➔</span>
        <span class="bg-slate-200 text-slate-600 font-bold text-xs px-3 py-1 rounded-lg uppercase">${poke.nextEvoId ? (poke.evoOptions && poke.evoOptions.length > 1 ? `Evolução aleatória (${poke.evoOptions.length} possíveis)` : 'Próxima Evolução') : 'Estágio Final'}</span>
    `;
    document.getElementById('detailsModal').classList.remove('hidden');
}

function fecharModalDetalhes() { document.getElementById('detailsModal').classList.add('hidden'); }
function removerSelecionado() {
    if (selectedIndex === null) return;
    setPokemonSelecionado(null);
    selectedIndex = null; selectedTipo = null;
    salvarDados(); renderGrids();
}
function limparColecao() {
    mostrarConfirmacao("Deletar Progresso?", "Tem certeza absoluta que deseja apagar toda a sua Pokédex?", () => {
        localStorage.clear(); location.reload(); 
    });
}