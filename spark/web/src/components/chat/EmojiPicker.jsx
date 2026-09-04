import React, { useState, useEffect, useMemo, useRef } from "react";

/* ── SPARK ORIGINALS (Branded Reaction Language) ── */
export const SPARK_ORIGINALS = [
  { emoji: "⚡", name: "Spark / Energy", tags: ["spark", "energy", "power", "bolt", "electric", "speed"] },
  { emoji: "✨", name: "Brilliant", tags: ["brilliant", "sparkle", "magic", "genius", "shining", "clean"] },
  { emoji: "💡", name: "Idea", tags: ["idea", "bulb", "eureka", "light", "insight", "smart"] },
  { emoji: "🧠", name: "Deep Thought", tags: ["brain", "thinking", "thought", "focus", "intellect", "mind"] },
  { emoji: "🎯", name: "Nailed It", tags: ["target", "bullseye", "exact", "accurate", "nailed", "goal"] },
  { emoji: "🚀", name: "Let's Go", tags: ["rocket", "launch", "lets go", "speed", "fast", "momentum"] },
  { emoji: "🫡", name: "Respect", tags: ["respect", "salute", "honor", "roger", "duty", "acknowledge"] },
  { emoji: "🧩", name: "Makes Sense", tags: ["makes sense", "puzzle", "logic", "piece", "solved", "connect"] },
  { emoji: "🫶", name: "Support", tags: ["support", "heart hands", "care", "warmth", "kindness", "love"] },
  { emoji: "🙌", name: "Celebration", tags: ["celebration", "praise", "hurray", "cheer", "hands", "woo"] },
  { emoji: "🤝", name: "Agreement", tags: ["agreement", "handshake", "deal", "partner", "trust", "consensus"] },
  { emoji: "👀", name: "Interested", tags: ["interested", "eyes", "watching", "curious", "look", "attention"] },
  { emoji: "💯", name: "Absolutely", tags: ["absolutely", "hundred", "perfect", "pure", "score", "yes"] },
];

/* ── STANDARD UNICODE EMOJI DATASET ── */
export const EMOJI_CATEGORIES = [
  {
    id: "spark",
    label: "Spark ✦",
    icon: "✦",
    emojis: SPARK_ORIGINALS,
  },
  {
    id: "smileys",
    label: "Smileys",
    icon: "😀",
    emojis: [
      { emoji: "😀", name: "Grinning Face", tags: ["happy", "smile", "grin"] },
      { emoji: "😃", name: "Smiling Face with Big Eyes", tags: ["happy", "smile", "joy"] },
      { emoji: "😄", name: "Smiling Face with Smiling Eyes", tags: ["happy", "smile", "laugh"] },
      { emoji: "😁", name: "Beaming Face", tags: ["smile", "grin", "teeth"] },
      { emoji: "😆", name: "Grinning Squinting Face", tags: ["laugh", "haha", "giggle"] },
      { emoji: "😅", name: "Grinning Face with Sweat", tags: ["hot", "relief", "sweat", "nervous"] },
      { emoji: "🤣", name: "Rolling on the Floor Laughing", tags: ["rofl", "lol", "laugh", "funny"] },
      { emoji: "😂", name: "Face with Tears of Joy", tags: ["crying laugh", "lol", "haha"] },
      { emoji: "🙂", name: "Slightly Smiling Face", tags: ["smile", "calm", "pleasant"] },
      { emoji: "🙃", name: "Upside-Down Face", tags: ["silly", "irony", "sarcasm"] },
      { emoji: "😉", name: "Winking Face", tags: ["wink", "flirt", "joke"] },
      { emoji: "😊", name: "Smiling Face with Smiling Eyes", tags: ["blush", "warm", "happy"] },
      { emoji: "😇", name: "Smiling Face with Halo", tags: ["angel", "innocent", "pure"] },
      { emoji: "🥰", name: "Smiling Face with Hearts", tags: ["love", "adore", "crush"] },
      { emoji: "😍", name: "Heart Eyes", tags: ["love", "infatuation", "adore"] },
      { emoji: "🤩", name: "Star-Struck", tags: ["amazed", "wow", "stars", "fan"] },
      { emoji: "😘", name: "Face Blowing a Kiss", tags: ["kiss", "love", "affection"] },
      { emoji: "😋", name: "Face Savoring Food", tags: ["yum", "delicious", "tasty"] },
      { emoji: "😛", name: "Face with Tongue", tags: ["tongue", "playful", "joke"] },
      { emoji: "😜", name: "Winking Face with Tongue", tags: ["crazy", "wink", "party"] },
      { emoji: "🤪", name: "Zany Face", tags: ["wild", "crazy", "goofy"] },
      { emoji: "😝", name: "Squinting Face with Tongue", tags: ["playful", "mischief"] },
      { emoji: "🤗", name: "Smiling Face with Open Hands", tags: ["hug", "open", "warm"] },
      { emoji: "🤭", name: "Face with Hand Over Mouth", tags: ["giggle", "oops", "secret"] },
      { emoji: "🤫", name: "Shushing Face", tags: ["quiet", "shh", "secret"] },
      { emoji: "🤔", name: "Thinking Face", tags: ["think", "hmm", "consider", "ponder"] },
      { emoji: "🤐", name: "Zipper-Mouth Face", tags: ["silence", "zip", "quiet"] },
      { emoji: "🤨", name: "Face with Raised Eyebrow", tags: ["skeptical", "suspicious", "really"] },
      { emoji: "😐", name: "Neutral Face", tags: ["neutral", "meh", "okay"] },
      { emoji: "😑", name: "Expressionless Face", tags: ["blank", "done", "deadpan"] },
      { emoji: "😶", name: "Face Without Mouth", tags: ["speechless", "silent"] },
      { emoji: "😏", name: "Smirking Face", tags: ["smirk", "sly", "clever"] },
      { emoji: "😒", name: "Unamused Face", tags: ["unamused", "bored", "annoyed"] },
      { emoji: "🙄", name: "Face with Rolling Eyes", tags: ["eye roll", "annoyed", "whatever"] },
      { emoji: "😬", name: "Grimacing Face", tags: ["grimace", "awkward", "oops"] },
      { emoji: "🤥", name: "Lying Face", tags: ["lie", "pinocchio"] },
      { emoji: "😌", name: "Relieved Face", tags: ["relief", "peace", "calm"] },
      { emoji: "😔", name: "Pensive Face", tags: ["sad", "thoughtful", "down"] },
      { emoji: "😪", name: "Sleepy Face", tags: ["tired", "rest"] },
      { emoji: "🤤", name: "Drooling Face", tags: ["hungry", "craving"] },
      { emoji: "😴", name: "Sleeping Face", tags: ["sleep", "zzz", "bed"] },
      { emoji: "😷", name: "Face with Medical Mask", tags: ["mask", "sick", "doctor"] },
      { emoji: "🤒", name: "Face with Thermometer", tags: ["fever", "ill", "sick"] },
      { emoji: "🤕", name: "Face with Head-Bandage", tags: ["hurt", "injured"] },
      { emoji: "🤢", name: "Nauseated Face", tags: ["gross", "disgust"] },
      { emoji: "🤮", name: "Face Vomiting", tags: ["barf", "sick", "gross"] },
      { emoji: "🥵", name: "Hot Face", tags: ["heat", "sweat", "spicy"] },
      { emoji: "🥶", name: "Cold Face", tags: ["freezing", "ice", "chilly"] },
      { emoji: "🥴", name: "Woozy Face", tags: ["dizzy", "tipsy"] },
      { emoji: "😵", name: "Face with Crossed-Out Eyes", tags: ["dazed", "stunned"] },
      { emoji: "🤯", name: "Exploding Head", tags: ["mind blown", "shock", "wow"] },
      { emoji: "🤠", name: "Cowboy Hat Face", tags: ["cowboy", "sheriff", "howdy"] },
      { emoji: "🥳", name: "Partying Face", tags: ["party", "celebrate", "birthday"] },
      { emoji: "🥸", name: "Disguised Face", tags: ["glasses", "disguise", "incognito"] },
      { emoji: "😎", name: "Smiling Face with Sunglasses", tags: ["cool", "shades", "boss"] },
      { emoji: "🤓", name: "Nerd Face", tags: ["nerd", "geek", "smart", "glasses"] },
      { emoji: "🧐", name: "Face with Monocle", tags: ["curious", "inspect", "monocle"] },
      { emoji: "😕", name: "Confused Face", tags: ["confused", "puzzled"] },
      { emoji: "😟", name: "Worried Face", tags: ["worried", "nervous"] },
      { emoji: "😮", name: "Face with Open Mouth", tags: ["surprise", "gasp", "wow"] },
      { emoji: "😯", name: "Hushed Face", tags: ["quiet", "surprised"] },
      { emoji: "😲", name: "Astonished Face", tags: ["shocked", "amazed"] },
      { emoji: "😳", name: "Flushed Face", tags: ["blush", "embarrassed", "wide eyes"] },
      { emoji: "🥺", name: "Pleading Face", tags: ["puppy eyes", "please", "begging"] },
      { emoji: "😦", name: "Frowning Face with Open Mouth", tags: ["frown", "scared"] },
      { emoji: "😨", name: "Fearful Face", tags: ["scared", "fear"] },
      { emoji: "😰", name: "Anxious Face with Sweat", tags: ["anxiety", "nervous"] },
      { emoji: "😥", name: "Sad but Relieved Face", tags: ["phew", "close call"] },
      { emoji: "😢", name: "Crying Face", tags: ["tear", "sad", "cry"] },
      { emoji: "😭", name: "Loudly Crying Face", tags: ["bawling", "sad", "tears"] },
      { emoji: "😱", name: "Face Screaming in Fear", tags: ["scream", "munch", "horror"] },
      { emoji: "😖", name: "Confounded Face", tags: ["struggling", "frustrated"] },
      { emoji: "😣", name: "Persevering Face", tags: ["endure", "effort"] },
      { emoji: "😞", name: "Disappointed Face", tags: ["down", "sad"] },
      { emoji: "😓", name: "Downcast Face with Sweat", tags: ["hard work", "exhausted"] },
      { emoji: "😩", name: "Weary Face", tags: ["tired", "overwhelmed"] },
      { emoji: "😫", name: "Tired Face", tags: ["exhausted", "done"] },
      { emoji: "🥱", name: "Yawning Face", tags: ["sleepy", "bored"] },
      { emoji: "😤", name: "Face with Steam From Nose", tags: ["triumph", "determined", "proud"] },
      { emoji: "😡", name: "Enraged Face", tags: ["furious", "mad", "red"] },
      { emoji: "😠", name: "Angry Face", tags: ["angry", "grumpy"] },
      { emoji: "🤬", name: "Face with Symbols on Mouth", tags: ["cursing", "swear"] },
      { emoji: "💀", name: "Skull", tags: ["dead", "skeleton", "dying laughing"] },
      { emoji: "💩", name: "Pile of Poo", tags: ["poop", "funny"] },
      { emoji: "🤡", name: "Clown Face", tags: ["clown", "circus", "silly"] },
      { emoji: "👻", name: "Ghost", tags: ["boo", "spooky", "halloween"] },
      { emoji: "👽", name: "Alien", tags: ["ufo", "space", "extraterrestrial"] },
      { emoji: "🤖", name: "Robot", tags: ["bot", "android", "ai", "machine"] },
    ],
  },
  {
    id: "people",
    label: "People",
    icon: "👋",
    emojis: [
      { emoji: "👋", name: "Waving Hand", tags: ["hello", "wave", "goodbye", "hi"] },
      { emoji: "🤚", name: "Raised Back of Hand", tags: ["hand", "raised"] },
      { emoji: "🖐️", name: "Hand with Fingers Splayed", tags: ["hand", "five", "stop"] },
      { emoji: "✋", name: "Raised Hand", tags: ["high five", "stop", "hand"] },
      { emoji: "🖖", name: "Vulcan Salute", tags: ["spock", "star trek"] },
      { emoji: "👌", name: "OK Hand", tags: ["ok", "perfect", "good"] },
      { emoji: "🤌", name: "Pinched Fingers", tags: ["italian", "question", "gesto"] },
      { emoji: "🤏", name: "Pinching Hand", tags: ["small", "tiny", "little bit"] },
      { emoji: "✌️", name: "Victory Hand", tags: ["peace", "v", "two"] },
      { emoji: "🤞", name: "Crossed Fingers", tags: ["luck", "hope", "promise"] },
      { emoji: "🫰", name: "Hand with Index Finger and Thumb Crossed", tags: ["finger heart", "kpop", "money"] },
      { emoji: "🤟", name: "Love-You Gesture", tags: ["ily", "love", "sign language"] },
      { emoji: "🤘", name: "Sign of the Horns", tags: ["rock", "metal", "party"] },
      { emoji: "🤙", name: "Call Me Hand", tags: ["shaka", "hang loose", "phone"] },
      { emoji: "👈", name: "Backhand Index Pointing Left", tags: ["point", "left"] },
      { emoji: "👉", name: "Backhand Index Pointing Right", tags: ["point", "right"] },
      { emoji: "👆", name: "Backhand Index Pointing Up", tags: ["point", "up", "look"] },
      { emoji: "👇", name: "Backhand Index Pointing Down", tags: ["point", "down", "below"] },
      { emoji: "☝️", name: "Index Pointing Up", tags: ["first", "number one", "point"] },
      { emoji: "👍", name: "Thumbs Up", tags: ["thumbs up", "good", "yes", "agree", "like"] },
      { emoji: "👎", name: "Thumbs Down", tags: ["thumbs down", "bad", "no", "dislike"] },
      { emoji: "✊", name: "Raised Fist", tags: ["fist", "power", "solidarity"] },
      { emoji: "👊", name: "Oncoming Fist", tags: ["punch", "fist bump"] },
      { emoji: "🤛", name: "Left-Facing Fist", tags: ["fist bump"] },
      { emoji: "🤜", name: "Right-Facing Fist", tags: ["fist bump"] },
      { emoji: "👏", name: "Clapping Hands", tags: ["clap", "applause", "bravo", "good job"] },
      { emoji: "🙌", name: "Raising Hands", tags: ["celebrate", "praise", "yay"] },
      { emoji: "🫶", name: "Heart Hands", tags: ["love", "support", "care"] },
      { emoji: "👐", name: "Open Hands", tags: ["open", "hug", "jazz hands"] },
      { emoji: "🤲", name: "Palms Up Together", tags: ["prayer", "offering"] },
      { emoji: "🤝", name: "Handshake", tags: ["deal", "agreement", "shake"] },
      { emoji: "🙏", name: "Folded Hands", tags: ["please", "thank you", "pray", "namaste"] },
      { emoji: "✍️", name: "Writing Hand", tags: ["write", "pen", "note"] },
      { emoji: "💪", name: "Flexed Biceps", tags: ["strong", "workout", "muscle", "flex"] },
      { emoji: "👀", name: "Eyes", tags: ["look", "see", "watching", "shifty"] },
      { emoji: "👁️", name: "Eye", tags: ["vision", "eye", "see"] },
    ],
  },
  {
    id: "nature",
    label: "Nature",
    icon: "🌱",
    emojis: [
      { emoji: "🐶", name: "Dog Face", tags: ["dog", "puppy", "pet"] },
      { emoji: "🐱", name: "Cat Face", tags: ["cat", "kitten", "meow"] },
      { emoji: "🐰", name: "Rabbit Face", tags: ["bunny", "rabbit"] },
      { emoji: "🦊", name: "Fox", tags: ["fox", "clever"] },
      { emoji: "🐻", name: "Bear", tags: ["bear", "cuddle"] },
      { emoji: "🐼", name: "Panda", tags: ["panda", "bear"] },
      { emoji: "🦁", name: "Lion", tags: ["lion", "king", "brave"] },
      { emoji: "🐯", name: "Tiger Face", tags: ["tiger", "wild"] },
      { emoji: "🐮", name: "Cow Face", tags: ["cow", "moo"] },
      { emoji: "🐵", name: "Monkey Face", tags: ["monkey"] },
      { emoji: "🦅", name: "Eagle", tags: ["eagle", "bird", "fly"] },
      { emoji: "🦉", name: "Owl", tags: ["owl", "wise", "night"] },
      { emoji: "🐝", name: "Honeybee", tags: ["bee", "buzz", "busy"] },
      { emoji: "🦋", name: "Butterfly", tags: ["butterfly", "beauty"] },
      { emoji: "🌸", name: "Cherry Blossom", tags: ["flower", "spring", "sakura"] },
      { emoji: "🌹", name: "Rose", tags: ["flower", "love", "red"] },
      { emoji: "🌻", name: "Sunflower", tags: ["flower", "sun", "yellow"] },
      { emoji: "🌲", name: "Evergreen Tree", tags: ["tree", "pine", "forest"] },
      { emoji: "🍀", name: "Four Leaf Clover", tags: ["clover", "lucky", "luck"] },
      { emoji: "🍁", name: "Maple Leaf", tags: ["autumn", "fall", "leaf"] },
      { emoji: "🌱", name: "Seedling", tags: ["grow", "plant", "sprout", "new"] },
      { emoji: "🪴", name: "Potted Plant", tags: ["plant", "home", "green"] },
      { emoji: "🌊", name: "Water Wave", tags: ["wave", "ocean", "sea", "surf"] },
      { emoji: "☀️", name: "Sun", tags: ["sunny", "bright", "day"] },
      { emoji: "🌤️", name: "Sun Behind Small Cloud", tags: ["weather", "warm"] },
      { emoji: "🌧️", name: "Cloud with Rain", tags: ["rain", "storm"] },
      { emoji: "❄️", name: "Snowflake", tags: ["snow", "cold", "winter"] },
      { emoji: "🌙", name: "Crescent Moon", tags: ["moon", "night", "sleep"] },
      { emoji: "🪐", name: "Ringed Planet", tags: ["planet", "space", "saturn"] },
      { emoji: "🌍", name: "Globe Europe-Africa", tags: ["earth", "world", "global"] },
    ],
  },
  {
    id: "food",
    label: "Food",
    icon: "☕",
    emojis: [
      { emoji: "☕", name: "Hot Beverage", tags: ["coffee", "tea", "caffeine", "warm"] },
      { emoji: "🫖", name: "Teapot", tags: ["tea", "brew"] },
      { emoji: "🍵", name: "Teacup Without Handle", tags: ["green tea", "matcha"] },
      { emoji: "🧋", name: "Bubble Tea", tags: ["boba", "milk tea"] },
      { emoji: "🍎", name: "Red Apple", tags: ["apple", "fruit", "healthy"] },
      { emoji: "🍌", name: "Banana", tags: ["fruit", "potassium"] },
      { emoji: "🍉", name: "Watermelon", tags: ["fruit", "summer"] },
      { emoji: "🥑", name: "Avocado", tags: ["healthy", "guacamole"] },
      { emoji: "🍕", name: "Pizza", tags: ["slice", "cheese", "food"] },
      { emoji: "🍔", name: "Hamburger", tags: ["burger", "fast food"] },
      { emoji: "🍟", name: "French Fries", tags: ["fries", "snack"] },
      { emoji: "🥪", name: "Sandwich", tags: ["lunch", "bread"] },
      { emoji: "🌮", name: "Taco", tags: ["mexican", "taco tuesday"] },
      { emoji: "🍜", name: "Steaming Bowl", tags: ["ramen", "noodles", "soup"] },
      { emoji: "🍣", name: "Sushi", tags: ["japanese", "fish"] },
      { emoji: "🥗", name: "Green Salad", tags: ["healthy", "salad", "diet"] },
      { emoji: "🍿", name: "Popcorn", tags: ["movie", "snack"] },
      { emoji: "🍫", name: "Chocolate Bar", tags: ["sweet", "candy"] },
      { emoji: "🎂", name: "Birthday Cake", tags: ["cake", "party", "bday"] },
    ],
  },
  {
    id: "activities",
    label: "Activities",
    icon: "🎯",
    emojis: [
      { emoji: "⚽", name: "Soccer Ball", tags: ["football", "sports"] },
      { emoji: "🏀", name: "Basketball", tags: ["sports", "hoops"] },
      { emoji: "🎾", name: "Tennis", tags: ["sports", "ball"] },
      { emoji: "🏓", name: "Ping Pong", tags: ["table tennis"] },
      { emoji: "🏸", name: "Badminton", tags: ["sports"] },
      { emoji: "🏏", name: "Cricket Game", tags: ["cricket", "match"] },
      { emoji: "🥊", name: "Boxing Glove", tags: ["fight", "punch"] },
      { emoji: "🧘", name: "Person in Lotus Position", tags: ["meditation", "yoga", "mindfulness"] },
      { emoji: "🏆", name: "Trophy", tags: ["winner", "prize", "first", "champion"] },
      { emoji: "🥇", name: "1st Place Medal", tags: ["gold", "winner", "first"] },
      { emoji: "🎨", name: "Artist Palette", tags: ["art", "design", "creative"] },
      { emoji: "🎬", name: "Clapper Board", tags: ["movie", "cinema", "film"] },
      { emoji: "🎧", name: "Headphone", tags: ["music", "listen", "audio"] },
      { emoji: "🎤", name: "Microphone", tags: ["sing", "voice", "podcast"] },
      { emoji: "🎮", name: "Video Game", tags: ["gaming", "play", "controller"] },
      { emoji: "🎲", name: "Game Die", tags: ["dice", "luck", "board game"] },
      { emoji: "♟️", name: "Chess Pawn", tags: ["chess", "strategy", "game"] },
    ],
  },
  {
    id: "travel",
    label: "Travel",
    icon: "🚀",
    emojis: [
      { emoji: "🚗", name: "Automobile", tags: ["car", "drive"] },
      { emoji: "🚕", name: "Taxi", tags: ["cab", "ride"] },
      { emoji: "🚲", name: "Bicycle", tags: ["bike", "cycling"] },
      { emoji: "✈️", name: "Airplane", tags: ["flight", "travel", "vacation"] },
      { emoji: "🚀", name: "Rocket", tags: ["space", "launch", "fast"] },
      { emoji: "🛸", name: "Flying Saucer", tags: ["ufo", "alien"] },
      { emoji: "⛵", name: "Sailboat", tags: ["boat", "water", "sailing"] },
      { emoji: "🗺️", name: "World Map", tags: ["map", "travel", "explore"] },
      { emoji: "🏖️", name: "Beach with Umbrella", tags: ["beach", "vacation", "summer"] },
      { emoji: "⛰️", name: "Mountain", tags: ["hike", "nature", "climb"] },
      { emoji: "🏕️", name: "Camping", tags: ["camp", "tent", "outdoors"] },
      { emoji: "🏢", name: "Office Building", tags: ["work", "company"] },
      { emoji: "🏠", name: "House", tags: ["home", "stay"] },
    ],
  },
  {
    id: "objects",
    label: "Objects",
    icon: "💡",
    emojis: [
      { emoji: "💻", name: "Laptop", tags: ["computer", "work", "tech", "mac"] },
      { emoji: "📱", name: "Mobile Phone", tags: ["iphone", "android", "cell"] },
      { emoji: "⌨️", name: "Keyboard", tags: ["typing", "computer"] },
      { emoji: "📷", name: "Camera", tags: ["photo", "picture"] },
      { emoji: "💡", name: "Light Bulb", tags: ["idea", "smart", "light"] },
      { emoji: "🔋", name: "Battery", tags: ["energy", "charge", "power"] },
      { emoji: "📚", name: "Books", tags: ["study", "reading", "knowledge", "learn"] },
      { emoji: "📖", name: "Open Book", tags: ["read", "chapter"] },
      { emoji: "📝", name: "Memo", tags: ["note", "write", "document"] },
      { emoji: "📁", name: "File Folder", tags: ["documents", "archive"] },
      { emoji: "📊", name: "Bar Chart", tags: ["analytics", "growth", "stats"] },
      { emoji: "📈", name: "Chart Increasing", tags: ["growth", "up", "success", "stock"] },
      { emoji: "📉", name: "Chart Decreasing", tags: ["down", "loss"] },
      { emoji: "🔍", name: "Magnifying Glass Tilted Left", tags: ["search", "find", "explore"] },
      { emoji: "🔒", name: "Locked", tags: ["secure", "private", "lock"] },
      { emoji: "🔓", name: "Unlocked", tags: ["open", "access"] },
      { emoji: "🔑", name: "Key", tags: ["solution", "password", "access"] },
      { emoji: "💎", name: "Gem Stone", tags: ["diamond", "valuable", "gem"] },
      { emoji: "🔔", name: "Bell", tags: ["notify", "alert", "notification"] },
    ],
  },
  {
    id: "symbols",
    label: "Symbols",
    icon: "❤️",
    emojis: [
      { emoji: "❤️", name: "Red Heart", tags: ["love", "heart", "like", "care"] },
      { emoji: "🧡", name: "Orange Heart", tags: ["heart", "orange"] },
      { emoji: "💛", name: "Yellow Heart", tags: ["heart", "yellow", "friendship"] },
      { emoji: "💚", name: "Green Heart", tags: ["heart", "green", "nature"] },
      { emoji: "💙", name: "Blue Heart", tags: ["heart", "blue", "trust"] },
      { emoji: "💜", name: "Purple Heart", tags: ["heart", "purple", "spark"] },
      { emoji: "🖤", name: "Black Heart", tags: ["heart", "black"] },
      { emoji: "🤍", name: "White Heart", tags: ["heart", "white", "pure"] },
      { emoji: "💔", name: "Broken Heart", tags: ["breakup", "heartbreak", "sad"] },
      { emoji: "🔥", name: "Fire", tags: ["lit", "hot", "fire", "trending", "streak"] },
      { emoji: "✨", name: "Sparkles", tags: ["clean", "magic", "stars", "shine"] },
      { emoji: "⭐", name: "Star", tags: ["favorite", "star", "rating"] },
      { emoji: "🌟", name: "Glowing Star", tags: ["shine", "superb"] },
      { emoji: "⚡", name: "High Voltage", tags: ["lightning", "electricity", "zap", "quick"] },
      { emoji: "💯", name: "Hundred Points", tags: ["100", "perfect", "score", "real"] },
      { emoji: "✅", name: "Check Mark Button", tags: ["done", "check", "correct", "verified"] },
      { emoji: "❌", name: "Cross Mark", tags: ["no", "cancel", "wrong"] },
      { emoji: "⚠️", name: "Warning", tags: ["alert", "caution"] },
      { emoji: "💬", name: "Speech Balloon", tags: ["chat", "message", "talk"] },
      { emoji: "💭", name: "Thought Balloon", tags: ["thinking", "idea"] },
    ],
  },
  {
    id: "flags",
    label: "Flags",
    icon: "🏁",
    emojis: [
      { emoji: "🏁", name: "Chequered Flag", tags: ["finish", "race", "win"] },
      { emoji: "🚩", name: "Triangular Flag", tags: ["red flag", "mark"] },
      { emoji: "🇮🇳", name: "Flag: India", tags: ["india", "in", "bharat"] },
      { emoji: "🇺🇸", name: "Flag: United States", tags: ["usa", "america", "us"] },
      { emoji: "🇬🇧", name: "Flag: United Kingdom", tags: ["uk", "britain", "gb"] },
      { emoji: "🇨🇦", name: "Flag: Canada", tags: ["canada", "ca"] },
      { emoji: "🇦🇺", name: "Flag: Australia", tags: ["australia", "au"] },
      { emoji: "🇩🇪", name: "Flag: Germany", tags: ["germany", "de"] },
      { emoji: "🇫🇷", name: "Flag: France", tags: ["france", "fr"] },
      { emoji: "🇯🇵", name: "Flag: Japan", tags: ["japan", "jp"] },
      { emoji: "🇸🇬", name: "Flag: Singapore", tags: ["singapore", "sg"] },
      { emoji: "🇦🇪", name: "Flag: United Arab Emirates", tags: ["uae", "dubai"] },
    ],
  },
];

/* ── RECENT EMOJIS PERSISTENCE HELPERS ── */
const STORAGE_KEY = "spark_user_recent_emojis_v1";

export function getRecentEmojis() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [
        { emoji: "❤️", name: "Red Heart", tags: ["love", "heart"] },
        { emoji: "🔥", name: "Fire", tags: ["fire", "lit"] },
        { emoji: "⚡", name: "Spark / Energy", tags: ["spark", "energy"] },
        { emoji: "👍", name: "Thumbs Up", tags: ["thumbs up"] },
        { emoji: "😂", name: "Tears of Joy", tags: ["haha", "laugh"] },
        { emoji: "✨", name: "Brilliant", tags: ["sparkle"] },
        { emoji: "💡", name: "Idea", tags: ["idea"] },
        { emoji: "🫡", name: "Respect", tags: ["salute"] },
      ];
    }
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function saveRecentEmoji(emojiObj) {
  try {
    const current = getRecentEmojis();
    const filtered = current.filter((item) => item.emoji !== emojiObj.emoji);
    const updated = [emojiObj, ...filtered].slice(0, 24);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Ignore storage issues
  }
}

/* ── COMPONENT ─────────────────────────────────────────────── */

export default function EmojiPicker({
  onSelectEmoji,
  onClose,
  anchorTitle = "Choose Reaction or Emoji",
}) {
  const [activeCategory, setActiveCategory] = useState("spark");
  const [searchQuery, setSearchQuery] = useState("");
  const [recentList, setRecentList] = useState([]);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setRecentList(getRecentEmojis());
  }, []);

  const handlePick = (emojiObj) => {
    saveRecentEmoji(emojiObj);
    onSelectEmoji(emojiObj.emoji, emojiObj);
  };

  // Search Results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;

    const all = [];
    const seen = new Set();

    // 1. Check Spark originals first
    for (const item of SPARK_ORIGINALS) {
      if (
        item.name.toLowerCase().includes(q) ||
        item.tags.some((t) => t.toLowerCase().includes(q)) ||
        item.emoji.includes(q)
      ) {
        all.push(item);
        seen.add(item.emoji);
      }
    }

    // 2. Check all categories
    for (const cat of EMOJI_CATEGORIES) {
      for (const item of cat.emojis) {
        if (!seen.has(item.emoji)) {
          if (
            item.name.toLowerCase().includes(q) ||
            item.tags.some((t) => t.toLowerCase().includes(q)) ||
            item.emoji.includes(q)
          ) {
            all.push(item);
            seen.add(item.emoji);
          }
        }
      }
    }

    return all;
  }, [searchQuery]);

  // Current category emojis to display
  const currentCategoryData = useMemo(() => {
    if (activeCategory === "recent") {
      return {
        id: "recent",
        label: "Recently Used",
        emojis: recentList,
      };
    }
    return EMOJI_CATEGORIES.find((c) => c.id === activeCategory) || EMOJI_CATEGORIES[0];
  }, [activeCategory, recentList]);

  return (
    <div
      role="dialog"
      aria-label={anchorTitle}
      style={{
        width: "100%",
        maxWidth: 380,
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: "var(--r, 16px)",
        boxShadow: "var(--sh-lg, 0 10px 30px rgba(0,0,0,0.18))",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "inherit",
        zIndex: 200,
        animation: "fadeIn .15s ease",
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--line)",
          background: "var(--surface-2)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: "var(--ink)" }}>{anchorTitle}</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close emoji picker"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--ink-soft)",
              padding: "4px 8px",
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--line)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            background: "var(--surface-2)",
            borderRadius: 18,
            padding: "6px 10px",
            border: "1px solid var(--line)",
          }}
        >
          <span style={{ fontSize: 13, marginRight: 6, opacity: 0.6 }}>🔍</span>
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emoji or Spark reaction…"
            aria-label="Search emojis"
            style={{
              border: "none",
              background: "transparent",
              outline: "none",
              fontSize: 13,
              color: "var(--ink)",
              width: "100%",
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                fontSize: 11,
                color: "var(--ink-soft)",
                padding: "2px 4px",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category Navigation Tabs (hidden when searching) */}
      {!searchQuery && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            overflowX: "auto",
            scrollbarWidth: "none",
            gap: 2,
            padding: "6px 8px",
            borderBottom: "1px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          {recentList.length > 0 && (
            <button
              type="button"
              onClick={() => setActiveCategory("recent")}
              title="Recently Used"
              aria-label="Recently Used"
              style={{
                background: activeCategory === "recent" ? "var(--surface-2)" : "transparent",
                border: activeCategory === "recent" ? "1px solid var(--line)" : "1px solid transparent",
                borderRadius: 8,
                padding: "4px 8px",
                fontSize: 14,
                cursor: "pointer",
                color: activeCategory === "recent" ? "var(--ink)" : "var(--ink-soft)",
                flexShrink: 0,
              }}
            >
              🕒
            </button>
          )}

          {EMOJI_CATEGORIES.map((cat) => {
            const isActive = activeCategory === cat.id;
            const isSpark = cat.id === "spark";
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                title={cat.label}
                aria-label={cat.label}
                style={{
                  background: isActive
                    ? isSpark
                      ? "rgba(139,92,246,0.12)"
                      : "var(--surface-2)"
                    : "transparent",
                  border: isActive
                    ? isSpark
                      ? "1px solid #8B5CF6"
                      : "1px solid var(--line)"
                    : "1px solid transparent",
                  borderRadius: 8,
                  padding: "4px 8px",
                  fontSize: 13,
                  fontWeight: isSpark ? 800 : 500,
                  cursor: "pointer",
                  color: isSpark
                    ? "#8B5CF6"
                    : isActive
                    ? "var(--ink)"
                    : "var(--ink-soft)",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                }}
              >
                <span>{cat.icon}</span>
                {isSpark && <span style={{ fontSize: 11 }}>Spark</span>}
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Scroll Area */}
      <div
        style={{
          maxHeight: 230,
          overflowY: "auto",
          padding: "10px 10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {/* If searching */}
        {searchResults !== null ? (
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--ink-soft)", marginBottom: 8 }}>
              {searchResults.length} {searchResults.length === 1 ? "Result" : "Results"} for "{searchQuery}"
            </div>
            {searchResults.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "var(--ink-soft)", fontSize: 13 }}>
                No emojis found matching "{searchQuery}"
              </div>
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 4,
                }}
              >
                {searchResults.map((item) => (
                  <EmojiItemButton key={item.emoji} item={item} onPick={handlePick} />
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Normal Category View */
          <div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
                padding: "0 4px",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                  color: currentCategoryData.id === "spark" ? "#8B5CF6" : "var(--ink-soft)",
                }}
              >
                {currentCategoryData.label}
              </span>
              {currentCategoryData.id === "spark" && (
                <span style={{ fontSize: 10, color: "#8B5CF6", fontWeight: 700, background: "#EDE9FE", padding: "1px 6px", borderRadius: 4 }}>
                  ORIGINAL
                </span>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 4,
              }}
            >
              {currentCategoryData.emojis.map((item) => (
                <EmojiItemButton
                  key={item.emoji}
                  item={item}
                  isSpark={currentCategoryData.id === "spark"}
                  onPick={handlePick}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── SINGLE EMOJI CELL BUTTON ── */
function EmojiItemButton({ item, isSpark = false, onPick }) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onPick(item)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={item.name}
      aria-label={item.name}
      style={{
        width: "100%",
        aspectRatio: "1/1",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: hovered
          ? isSpark
            ? "rgba(139, 92, 246, 0.15)"
            : "var(--surface-2)"
          : isSpark
          ? "rgba(139, 92, 246, 0.04)"
          : "transparent",
        border: isSpark
          ? "1px solid rgba(139, 92, 246, 0.2)"
          : "1px solid transparent",
        borderRadius: 8,
        fontSize: isSpark ? 22 : 20,
        cursor: "pointer",
        transition: "all .12s ease",
        transform: hovered ? "scale(1.18)" : "scale(1)",
        position: "relative",
      }}
    >
      <span>{item.emoji}</span>
      {isSpark && (
        <span
          style={{
            position: "absolute",
            bottom: 2,
            right: 2,
            fontSize: 7,
            color: "#8B5CF6",
            lineHeight: 1,
          }}
        >
          ✦
        </span>
      )}
    </button>
  );
}
