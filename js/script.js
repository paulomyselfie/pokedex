const TOTAL_FEATURED = 5;
const TOTAL_STANDARD = 10; // Slots por box

// Estado do Jogo (Time + Múltiplas Boxes para cumprir o CRUD)
let timeAtivo = new Array(TOTAL_FEATURED).fill(null);
let pcBoxes = [ { nome: "Box 1", slots: new Array(TOTAL_STANDARD).fill(null) } ];
let caixaAtualIndex = 0;

let selectedIndex = null;
let selectedTipo = null; // 'time' ou 'box'
let bagasCount = 5;

// Dicionário de backup com os Pokémon iniciais e evoluções em PT-BR
const POKEMON_DATABASE = {
    1: { rawId: 1, name: "Bulbasaur", types: ["planta", "veneno"], abilities: ["clorofila", "supercrescimento"], height: "0.7", weight: "6.9", nextEvoId: 2, stage: 1, stats: { hp: 45, attack: 49, defense: 49, spAtk: 65, spDef: 65, speed: 45 } },
    2: { rawId: 2, name: "Ivysaur", types: ["planta", "veneno"], abilities: ["clorofila", "supercrescimento"], height: "1.0", weight: "13.0", nextEvoId: 3, stage: 2, stats: { hp: 60, attack: 62, defense: 80, spAtk: 80, spDef: 80, speed: 60 } },
    3: { rawId: 3, name: "Venusaur", types: ["planta", "veneno"], abilities: ["clorofila", "sebo-espeso"], height: "2.0", weight: "100.0", nextEvoId: null, stage: 3, stats: { hp: 80, attack: 82, defense: 83, spAtk: 100, spDef: 100, speed: 80 } },
    
    4: { rawId: 4, name: "Charmander", types: ["fogo"], abilities: ["chama", "poder-solar"], height: "0.6", weight: "8.5", nextEvoId: 5, stage: 1, stats: { hp: 39, attack: 52, defense: 43, spAtk: 60, spDef: 50, speed: 65 } },
    5: { rawId: 5, name: "Charmeleon", types: ["fogo"], abilities: ["chama", "poder-solar"], height: "1.1", weight: "19.0", nextEvoId: 6, stage: 2, stats: { hp: 58, attack: 64, defense: 58, spAtk: 80, spDef: 65, speed: 80 } },
    6: { rawId: 6, name: "Charizard", types: ["fogo", "voador"], abilities: ["chama", "poder-solar"], height: "1.7", weight: "90.5", nextEvoId: null, stage: 3, stats: { hp: 78, attack: 84, defense: 78, spAtk: 109, spDef: 85, speed: 100 } },
    
    7: { rawId: 7, name: "Squirtle", types: ["água"], abilities: ["torrente", "prato-de-chuva"], height: "0.5", weight: "9.0", nextEvoId: 8, stage: 1, stats: { hp: 44, attack: 48, defense: 65, spAtk: 50, spDef: 64, speed: 43 } },
    8: { rawId: 8, name: "Wartortle", types: ["água"], abilities: ["torrente", "prato-de-chuva"], height: "1.0", weight: "22.5", nextEvoId: 9, stage: 2, stats: { hp: 59, attack: 63, defense: 80, spAtk: 65, spDef: 80, speed: 58 } },
    9: { rawId: 9, name: "Blastoise", types: ["água"], abilities: ["torrente", "prato-de-chuva"], height: "1.6", weight: "85.5", nextEvoId: null, stage: 3, stats: { hp: 79, attack: 83, defense: 100, spAtk: 85, spDef: 105, speed: 78 } }
};

document.addEventListener("DOMContentLoaded", () => {
    carregarDadosLocais();
    verificarInicialEBonus();
    atualizarSelectBoxes();
    renderGrids();
    atualizarHeaderBagas();
});

function formatarNomePokemon(str, rawId) {
    if (!str || str.startsWith("pokemon #") || str.startsWith("Pokémon #")) {
        return `Pokémon #${rawId}`;
    }
    return str
        .replace(/-/g, ' ')
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

function getPokemonObjectById(idNum) {
    const entry = POKEMON_DATABASE[idNum];
    if (entry) {
        return {
            id: String(entry.rawId).padStart(3, '0'),
            rawId: entry.rawId,
            name: entry.name,
            image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${entry.rawId}.png`,
            types: [...entry.types],
            abilities: [...entry.abilities],
            height: entry.height,
            weight: entry.weight,
            stage: entry.stage,
            nextEvoId: entry.nextEvoId,
            alimentacoes: 0,
            stats: { ...entry.stats }
        };
    }

    return {
        id: String(idNum).padStart(3, '0'),
        rawId: idNum,
        name: `Pokémon #${idNum}`,
        image: `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${idNum}.png`,
        types: ["normal"],
        abilities: ["fuga"],
        height: "0.8",
        weight: "12.0",
        stage: 1,
        nextEvoId: idNum < 386 ? idNum + 1 : null,
        alimentacoes: 0,
        stats: { hp: 50, attack: 55, defense: 50, spAtk: 55, spDef: 50, speed: 50 }
    };
}

async function fetchPokemonFromAPIOrDatabase(idNum) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${idNum}`, { signal: controller.signal });
        clearTimeout(timeoutId);

        if (res.ok) {
            const data = await res.json();
            const localBase = POKEMON_DATABASE[idNum] || {};

            const nomeTratado = formatarNomePokemon(data.name, idNum);

            return {
                id: String(data.id).padStart(3, '0'),
                rawId: data.id,
                name: nomeTratado,
                image: data.sprites?.other?.['official-artwork']?.front_default || `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${data.id}.png`,
                types: data.types ? data.types.map(t => traduzirTipo(t.type.name)) : (localBase.types || ['normal']),
                abilities: data.abilities ? data.abilities.map(a => traduzirHabilidade(a.ability.name)) : (localBase.abilities || ['clorofila']),
                height: data.height ? (data.height / 10).toFixed(1) : "0.8",
                weight: data.weight ? (data.weight / 10).toFixed(1) : "10.0",
                stage: localBase.stage || 1,
                nextEvoId: localBase.nextEvoId || (data.id < 386 ? data.id + 1 : null),
                alimentacoes: 0,
                stats: {
                    hp: data.stats?.[0]?.base_stat || 50,
                    attack: data.stats?.[1]?.base_stat || 50,
                    defense: data.stats?.[2]?.base_stat || 50,
                    spAtk: data.stats?.[3]?.base_stat || 50,
                    spDef: data.stats?.[4]?.base_stat || 50,
                    speed: data.stats?.[5]?.base_stat || 50
                }
            };
        }
    } catch (e) {
        console.warn(`PokéAPI indisponível para o ID ${idNum}. Usando fallback local.`);
    }

    return getPokemonObjectById(idNum);
}

function traduzirTipo(tipoIngles) {
    const mapaTipos = {
        fire: "fogo", water: "água", grass: "planta", electric: "elétrico",
        poison: "veneno", flying: "voador", bug: "inseto", normal: "normal",
        ground: "terrestre", rock: "pedra", psychic: "psíquico", ice: "gelo",
        dragon: "dragão", ghost: "fantasma", dark: "sombrio", steel: "aço", fairy: "fada"
    };
    return mapaTipos[tipoIngles.toLowerCase()] || tipoIngles;
}

function traduzirHabilidade(habIngles) {
    const mapaHabilidades = {
        overgrow: "supercrescimento", chlorophyll: "clorofila",
        blaze: "chama", "solar-power": "poder-solar",
        torrent: "torrente", "rain-dish": "prato-de-chuva",
        "shield-dust": "poeira-escudo", "run-away": "fuga",
        "shed-skin": "troca-de-pele", "compound-eyes": "olhos-compostos",
        "tinted-lens": "lente-colorida", "keen-eye": "olho-aguçado",
        "tangled-feet": "pés-desajeitados", static: "estática",
        "lightning-rod": "para-raios", adaptability: "adaptabilidade",
        "water-absorb": "absorve-água", hydration: "hidratação",
        intimidate: "intimidação", levitate: "levitação",
        "speed-boost": "impulso", trace: "rastreio"
    };
    return mapaHabilidades[habIngles.toLowerCase()] || habIngles;
}

// ====== GESTÃO DE CAIXAS (CRUD) ======
function atualizarSelectBoxes() {
    const sel = document.getElementById('boxSelect');
    if(!sel) return;
    sel.innerHTML = '';
    pcBoxes.forEach((box, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = box.nome;
        if(idx === caixaAtualIndex) opt.selected = true;
        sel.appendChild(opt);
    });
}

function mudarBox() {
    const sel = document.getElementById('boxSelect');
    caixaAtualIndex = parseInt(sel.value);
    selectedIndex = null;
    selectedTipo = null;
    renderGrids();
}

function criarBox() {
    const nome = prompt("Nome da nova Box:");
    if (nome && nome.trim() !== "") {
        pcBoxes.push({ nome: nome.trim(), slots: new Array(TOTAL_STANDARD).fill(null) });
        caixaAtualIndex = pcBoxes.length - 1;
        selectedIndex = null;
        selectedTipo = null;
        atualizarSelectBoxes();
        salvarDados();
        renderGrids();
    }
}

function renomearBox() {
    const nomeAtual = pcBoxes[caixaAtualIndex].nome;
    const novoNome = prompt("Novo nome para a Box:", nomeAtual);
    if (novoNome && novoNome.trim() !== "") {
        pcBoxes[caixaAtualIndex].nome = novoNome.trim();
        atualizarSelectBoxes();
        salvarDados();
    }
}

function apagarBox() {
    if (pcBoxes.length <= 1) {
        alert("Você precisa ter pelo menos uma Box!");
        return;
    }
    if (confirm("Tem certeza que deseja apagar esta Box? Todos os Pokémon nela serão libertados.")) {
        pcBoxes.splice(caixaAtualIndex, 1);
        caixaAtualIndex = 0;
        selectedIndex = null;
        selectedTipo = null;
        atualizarSelectBoxes();
        salvarDados();
        renderGrids();
    }
}

// ====== SORTEIO ======
async function sortearPokemon() {
    let slotVagoIndex = timeAtivo.findIndex(item => item === null);
    let destino = 'time';

    if (slotVagoIndex === -1) {
        slotVagoIndex = pcBoxes[caixaAtualIndex].slots.findIndex(item => item === null);
        destino = 'box';
    }

    if (slotVagoIndex === -1) {
        alert(`O Time Ativo e a '${pcBoxes[caixaAtualIndex].nome}' estão cheios!`);
        return;
    }

    const btnSortear = document.getElementById("btnSortear");
    const btnSortearText = document.getElementById("btnSortearText");
    const loaderIcon = document.getElementById("loaderIcon");
    const pokeballGraphic = document.getElementById("pokeballGraphic");
    const pokemonCard = document.getElementById("pokemonCard");

    if (btnSortear) btnSortear.disabled = true;
    if (btnSortearText) btnSortearText.innerText = "SORTEANDO...";
    if (loaderIcon) loaderIcon.classList.remove("hidden");
    if (pokeballGraphic) pokeballGraphic.classList.add("shake-anim");

    // Sorteio padrão de 1 a 386
    const randomId = Math.floor(Math.random() * 386) + 1;
    const novoPokemon = await fetchPokemonFromAPIOrDatabase(randomId);

    setTimeout(() => {
        if (pokeballGraphic) {
            pokeballGraphic.classList.remove("shake-anim");
            pokeballGraphic.classList.add("hidden");
        }

        const pokemonImg = document.getElementById("pokemonImg");
        const pokemonNumber = document.getElementById("pokemonNumber");
        const pokemonName = document.getElementById("pokemonName");
        const typesDiv = document.getElementById("pokemonTypes");

        if (pokemonImg) pokemonImg.src = novoPokemon.image;
        if (pokemonNumber) pokemonNumber.innerText = `#${novoPokemon.id}`;
        if (pokemonName) pokemonName.innerText = novoPokemon.name;

        if (typesDiv) {
            typesDiv.innerHTML = novoPokemon.types.map(t => 
                `<span class="text-[9px] font-bold uppercase bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full">${t}</span>`
            ).join('');
        }

        if (pokemonCard) pokemonCard.classList.remove("hidden");

        if (destino === 'time') {
            timeAtivo[slotVagoIndex] = novoPokemon;
            selectedIndex = slotVagoIndex;
            selectedTipo = 'time';
        } else {
            pcBoxes[caixaAtualIndex].slots[slotVagoIndex] = novoPokemon;
            selectedIndex = slotVagoIndex;
            selectedTipo = 'box';
        }

        salvarDados();
        renderGrids();

        if (btnSortear) btnSortear.disabled = false;
        if (btnSortearText) btnSortearText.innerText = "SORTEAR";
        if (loaderIcon) loaderIcon.classList.add("hidden");
    }, 600);
}

function carregarDadosLocais() {
    const savedTime = localStorage.getItem('pokedex_time_v7');
    const savedBoxes = localStorage.getItem('pokedex_boxes_v7');
    const savedBerries = localStorage.getItem('pokedex_berries');
    
    if (savedTime && savedBoxes) {
        try {
            timeAtivo = JSON.parse(savedTime);
            pcBoxes = JSON.parse(savedBoxes);
        } catch(e) { }
    }
    if (savedBerries !== null) {
        bagasCount = parseInt(savedBerries, 10);
    }
}

function salvarDados() {
    localStorage.setItem('pokedex_time_v7', JSON.stringify(timeAtivo));
    localStorage.setItem('pokedex_boxes_v7', JSON.stringify(pcBoxes));
    localStorage.setItem('pokedex_berries', bagasCount.toString());
}

function verificarInicialEBonus() {
    const starterChosen = localStorage.getItem('pokedex_starter_chosen');
    const hasAnyPokemon = timeAtivo.some(p => p !== null) || pcBoxes.some(box => box.slots.some(p => p !== null));

    if (!starterChosen && !hasAnyPokemon) {
        const starterModal = document.getElementById('starterModal');
        if (starterModal) starterModal.classList.remove('hidden');
        return;
    }

    const hoje = new Date().toDateString();
    const ultimoLogin = localStorage.getItem('pokedex_last_login');

    if (ultimoLogin !== hoje) {
        bagasCount += 5;
        localStorage.setItem('pokedex_last_login', hoje);
        salvarDados();
        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) welcomeModal.classList.remove('hidden');
    }
}

async function escolherInicial(numId) {
    const pokemonInicial = await fetchPokemonFromAPIOrDatabase(numId);
    
    timeAtivo[0] = pokemonInicial;
    localStorage.setItem('pokedex_starter_chosen', 'true');
    salvarDados();

    const starterModal = document.getElementById('starterModal');
    if (starterModal) starterModal.classList.add('hidden');
    
    selectedIndex = 0;
    selectedTipo = 'time';
    renderGrids();
    
    const hoje = new Date().toDateString();
    const ultimoLogin = localStorage.getItem('pokedex_last_login');
    if (ultimoLogin !== hoje) {
        bagasCount += 5;
        localStorage.setItem('pokedex_last_login', hoje);
        salvarDados();
        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) welcomeModal.classList.remove('hidden');
    }
}

function fecharModalBonus() {
    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) welcomeModal.classList.add('hidden');
    atualizarHeaderBagas();
}

function atualizarHeaderBagas() {
    const berryDisplay = document.getElementById('berryCountDisplay');
    if (berryDisplay) berryDisplay.innerText = bagasCount;
}

function renderGrids() {
    const featuredContainer = document.getElementById("featuredGrid");
    const standardContainer = document.getElementById("standardGrid");

    if (featuredContainer) featuredContainer.innerHTML = "";
    if (standardContainer) standardContainer.innerHTML = "";

    let totalCount = 0;

    // Renderiza Time Ativo (5 slots)
    for (let i = 0; i < TOTAL_FEATURED; i++) {
        const poke = timeAtivo[i];
        if (poke) totalCount++;
        const isSelected = selectedTipo === 'time' && selectedIndex === i;
        const slot = document.createElement("div");
        
        slot.className = `slot-card featured-slot aspect-[4/5] rounded-xl border-2 transition-all cursor-pointer flex flex-col items-center justify-center p-1 relative overflow-hidden ${
            isSelected ? 'border-pokeRed ring-2 ring-pokeRed/30 bg-red-50/40 scale-105 z-10' : 
            poke ? 'border-pokeTealDark bg-teal-50/20 hover:border-pokeRed/50' : 'border-slate-200/70 bg-slate-50 hover:border-slate-300'
        }`;
        
        if (poke) {
            slot.onclick = () => selecionarSlot('time', i);
            slot.innerHTML = `
                <span class="absolute top-1 left-1 text-[9px] font-bold text-slate-400">#${poke.id}</span>
                <span class="absolute top-1 right-1 text-[8px] font-extrabold bg-pokeGreen text-white px-1 rounded-full">${poke.alimentacoes || 0}/3</span>
                <img src="${poke.image}" alt="${poke.name}" class="w-full h-full object-contain p-1">
            `;
        } else {
            slot.onclick = () => selecionarSlot('time', i);
            slot.innerHTML = `
                <svg class="w-5 h-5 text-slate-300" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10a10 10 0 0 0 10-10A10 10 0 0 0 12 2zm0 2a8 8 0 0 1 7.93 7H15a3 3 0 0 0-6 0H2.07A8 8 0 0 1 12 4zm0 16a8 8 0 0 1-7.93-7H9a3 3 0 0 0 6 0h5.93A8 8 0 0 1 12 20zm0-9a1 1 0 1 1-1 1a1 1 0 0 1 1-1z"/>
                </svg>
            `;
        }
        if (featuredContainer) featuredContainer.appendChild(slot);
    }

    // Renderiza a Box Atual do PC
    const boxSlots = pcBoxes[caixaAtualIndex].slots;
    for (let i = 0; i < TOTAL_STANDARD; i++) {
        const poke = boxSlots[i];
        if (poke) totalCount++;
        const isSelected = selectedTipo === 'box' && selectedIndex === i;
        const slot = document.createElement("div");

        slot.className = `slot-card aspect-square rounded-xl transition-all cursor-pointer flex flex-col items-center justify-center p-1 relative overflow-hidden ${
            isSelected ? 'bg-slate-700 ring-2 ring-pokeRed border border-pokeRed scale-105 z-10' :
            poke ? 'bg-slate-800 border border-slate-600 hover:border-pokeRed/50' : 'bg-pokeSlotDark shadow-inner hover:bg-slate-700/50'
        }`;
        
        if (poke) {
            slot.onclick = () => selecionarSlot('box', i);
            slot.innerHTML = `
                <span class="absolute top-1 right-1 text-[8px] font-extrabold bg-pokeGreen text-white px-1 rounded-full">${poke.alimentacoes || 0}/3</span>
                <img src="${poke.image}" alt="${poke.name}" class="w-full h-full object-contain p-1">
            `;
        } else {
            slot.onclick = () => selecionarSlot('box', i);
            slot.innerHTML = `<div class="w-1.5 h-1.5 rounded-full bg-slate-500/40"></div>`;
        }
        if (standardContainer) standardContainer.appendChild(slot);
    }

    // Calcula total geral de todos os Pokémon guardados
    let totalGeral = timeAtivo.filter(p => p !== null).length;
    pcBoxes.forEach(box => totalGeral += box.slots.filter(p => p !== null).length);

    const counter = document.getElementById("counter");
    if (counter) counter.innerText = `${totalGeral} Pokémon`;
    atualizarPainelSelecionado();
}

function selecionarSlot(tipo, index) {
    selectedTipo = tipo;
    selectedIndex = index;
    renderGrids();
}

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
    const img = document.getElementById("selectedImg");
    const name = document.getElementById("selectedName");
    const status = document.getElementById("selectedStatus");
    const stage = document.getElementById("selectedStage");
    const actionBtns = document.getElementById("actionButtons");
    const feedCounter = document.getElementById("feedCounter");
    const btnFeed = document.getElementById("btnFeed");
    const btnFeedLabel = document.getElementById("btnFeedLabel");
    const btnMove = document.getElementById("btnMove");

    const poke = getPokemonSelecionado();

    if (selectedIndex !== null && poke) {
        if (img) img.src = poke.image;
        if (name) name.innerText = `#${poke.id} ${poke.name}`;
        if (status) status.innerText = `Tipos: ${poke.types.join(', ')} | ${selectedTipo === 'time' ? 'Time Ativo' : pcBoxes[caixaAtualIndex].nome}`;
        if (stage) {
            stage.innerText = `Estágio ${poke.stage || 1}`;
            stage.classList.remove("hidden");
        }

        const isMaxStage = !poke.nextEvoId;
        if (isMaxStage) {
            if (btnFeedLabel) btnFeedLabel.innerText = "⭐ Nível Máx.";
            if (feedCounter) feedCounter.classList.add("hidden");
            if (btnFeed) {
                btnFeed.disabled = true;
                btnFeed.classList.add("opacity-60", "cursor-not-allowed");
            }
        } else {
            if (btnFeedLabel) btnFeedLabel.innerText = "🍎 Alimentar";
            if (feedCounter) {
                feedCounter.innerText = `${poke.alimentacoes || 0}/3`;
                feedCounter.classList.remove("hidden");
            }
            if (btnFeed) {
                btnFeed.disabled = false;
                btnFeed.classList.remove("opacity-60", "cursor-not-allowed");
            }
        }

        if (btnMove) btnMove.innerText = selectedTipo === 'time' ? "⇄ Mover p/ PC" : "⇄ Mover p/ Time";
        if (actionBtns) actionBtns.classList.remove("hidden");
    } else {
        if (img) img.src = "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png";
        if (name) name.innerText = "Selecione um Pokémon";
        if (status) status.innerText = "Clique em um slot para interagir.";
        if (stage) stage.classList.add("hidden");
        if (actionBtns) actionBtns.classList.add("hidden");
    }
}

async function alimentarPokemon() {
    const poke = getPokemonSelecionado();
    if (selectedIndex === null || !poke) return;

    if (!poke.nextEvoId) {
        alert("Este Pokémon já atingiu seu estágio final de evolução!");
        return;
    }

    if (bagasCount <= 0) {
        alert("Você não tem Bagas suficientes!");
        return;
    }

    bagasCount--;
    poke.alimentacoes = (poke.alimentacoes || 0) + 1;

    atualizarHeaderBagas();

    if (poke.alimentacoes >= 3) {
        poke.alimentacoes = 0;
        await evoluirPokemon(poke);
    } else {
        setPokemonSelecionado(poke);
        salvarDados();
        renderGrids();
    }
}

async function evoluirPokemon(poke) {
    const imgElement = document.getElementById("selectedImg");
    if (imgElement) {
        imgElement.classList.add("evolve-anim");
        setTimeout(() => imgElement.classList.remove("evolve-anim"), 1200);
    }

    const targetEvoId = poke.nextEvoId;
    if (!targetEvoId) return;

    const evolvedData = await fetchPokemonFromAPIOrDatabase(targetEvoId);

    poke.id = evolvedData.id;
    poke.rawId = evolvedData.rawId;
    poke.name = evolvedData.name;
    poke.image = evolvedData.image;
    poke.types = evolvedData.types;
    poke.abilities = evolvedData.abilities;
    poke.height = evolvedData.height;
    poke.weight = evolvedData.weight;
    poke.stage = evolvedData.stage;
    poke.nextEvoId = evolvedData.nextEvoId;
    poke.stats = evolvedData.stats;

    setPokemonSelecionado(poke);
    salvarDados();
    renderGrids();
}

function moverPokemon() {
    const poke = getPokemonSelecionado();
    if (selectedIndex === null || !poke) return;

    if (selectedTipo === 'time') {
        let targetSlot = -1;
        for (let i = 0; i < TOTAL_STANDARD; i++) {
            if (pcBoxes[caixaAtualIndex].slots[i] === null) {
                targetSlot = i;
                break;
            }
        }

        if (targetSlot !== -1) {
            pcBoxes[caixaAtualIndex].slots[targetSlot] = poke;
            timeAtivo[selectedIndex] = null;
            selectedTipo = 'box';
            selectedIndex = targetSlot;
        } else {
            alert(`A Box '${pcBoxes[caixaAtualIndex].nome}' está cheia! Crie ou mude para outra Box.`);
            return;
        }
    } else {
        let targetSlot = -1;
        for (let i = 0; i < TOTAL_FEATURED; i++) {
            if (timeAtivo[i] === null) {
                targetSlot = i;
                break;
            }
        }

        if (targetSlot !== -1) {
            timeAtivo[targetSlot] = poke;
            pcBoxes[caixaAtualIndex].slots[selectedIndex] = null;
            selectedTipo = 'time';
            selectedIndex = targetSlot;
        } else {
            alert("Seu Time Ativo já tem 5 Pokémon!");
            return;
        }
    }

    salvarDados();
    renderGrids();
}

function abrirModalDetalhes() {
    const poke = getPokemonSelecionado();
    if (selectedIndex === null || !poke) return;

    const modalTitle = document.getElementById('modalTitle');
    const modalCategory = document.getElementById('modalCategory');
    const modalId = document.getElementById('modalId');
    const modalHeight = document.getElementById('modalHeight');
    const modalWeight = document.getElementById('modalWeight');
    const modalImg = document.getElementById('modalImg');

    if (modalTitle) modalTitle.innerText = poke.name;
    if (modalCategory) modalCategory.innerText = `${poke.types.join(' / ')} Pokémon`;
    if (modalId) modalId.innerText = `#${poke.id}`;
    if (modalHeight) modalHeight.innerText = `${poke.height || '0.7'} m`;
    if (modalWeight) modalWeight.innerText = `${poke.weight || '6.9'} kg`;
    if (modalImg) modalImg.src = poke.image;

    const abilitiesContainer = document.getElementById('modalAbilities');
    if (abilitiesContainer) {
        abilitiesContainer.innerHTML = (poke.abilities || ['supercrescimento']).map(a => 
            `<span class="bg-slate-700 text-white font-semibold text-[9px] uppercase px-2 py-0.5 rounded-md">${a}</span>`
        ).join('');
    }

    const typesContainer = document.getElementById('modalTypes');
    if (typesContainer) {
        typesContainer.innerHTML = poke.types.map(t => 
            `<span class="bg-indigo-500 text-white font-bold text-[10px] uppercase px-2.5 py-0.5 rounded-md">${t}</span>`
        ).join('');
    }

    const stats = poke.stats || { hp: 50, attack: 50, defense: 50, spAtk: 50, spDef: 50, speed: 50 };
    
    const setStat = (valId, barId, val) => {
        const valElem = document.getElementById(valId);
        const barElem = document.getElementById(barId);
        if (valElem) valElem.innerText = val;
        if (barElem) {
            const perc = Math.min(100, Math.round((val / 160) * 100));
            barElem.style.width = `${perc}%`;
        }
    };

    setStat('statHpVal', 'statHpBar', stats.hp);
    setStat('statAtkVal', 'statAtkBar', stats.attack);
    setStat('statDefVal', 'statDefBar', stats.defense);
    setStat('statSpAtkVal', 'statSpAtkBar', stats.spAtk);
    setStat('statSpDefVal', 'statSpDefBar', stats.spDef);
    setStat('statSpdVal', 'statSpdBar', stats.speed);

    const evoContainer = document.getElementById('modalEvoChain');
    if (evoContainer) {
        evoContainer.innerHTML = `
            <div class="flex items-center gap-2 flex-wrap justify-center">
                <span class="bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs px-3 py-1 rounded-lg uppercase">${poke.name}</span>
                <span class="text-slate-400 font-bold">➔</span>
                <span class="bg-slate-200 text-slate-600 font-bold text-xs px-3 py-1 rounded-lg uppercase">${poke.nextEvoId ? `Próxima Evolução (#${String(poke.nextEvoId).padStart(3, '0')})` : 'Estágio Final (Máx)'}</span>
            </div>
        `;
    }

    const detailsModal = document.getElementById('detailsModal');
    if (detailsModal) detailsModal.classList.remove('hidden');
}

function fecharModalDetalhes() {
    const detailsModal = document.getElementById('detailsModal');
    if (detailsModal) detailsModal.classList.add('hidden');
}

function removerSelecionado() {
    if (selectedIndex === null) return;
    setPokemonSelecionado(null);
    selectedIndex = null;
    selectedTipo = null;
    salvarDados();
    renderGrids();
}

function limparColecao() {
    if (confirm("Tem certeza que deseja resetar todo o jogo?")) {
        timeAtivo = new Array(TOTAL_FEATURED).fill(null);
        pcBoxes = [ { nome: "Box 1", slots: new Array(TOTAL_STANDARD).fill(null) } ];
        caixaAtualIndex = 0;
        selectedIndex = null;
        selectedTipo = null;
        localStorage.removeItem('pokedex_starter_chosen');
        localStorage.removeItem('pokedex_time_v7');
        localStorage.removeItem('pokedex_boxes_v7');
        salvarDados();
        atualizarSelectBoxes();
        renderGrids();
        const starterModal = document.getElementById('starterModal');
        if (starterModal) starterModal.classList.remove('hidden');
    }
}