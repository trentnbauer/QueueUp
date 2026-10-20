/** Everyday three to six letter words the Anagram game scrambles: short ones come first in a round (see WORDS_PER_LENGTH in anagram.ts). Lower
 * case, letters only. Short words are picked so that no two are made of the same letters (no cat and act), since any word of the same
 * letters in this list counts as an answer. */
export const ANAGRAM_WORDS: readonly string[] = [
  'sun', 'fox', 'cup', 'pen', 'hat', 'bed', 'key', 'sky', 'jam', 'pig', 'fan', 'web', 'zip', 'cow', 'egg', 'ice', 'hen', 'jar', 'pie', 'toy',
  'fig', 'gem', 'ink', 'lip', 'mud', 'rug', 'sea', 'bat', 'dog', 'bus',
  'bird', 'cake', 'door', 'fish', 'gold', 'hand', 'jump', 'king', 'lamp', 'milk', 'nose', 'park', 'ship', 'tree', 'wolf', 'yard', 'zero',
  'boat', 'card', 'duck', 'farm', 'kite', 'hill', 'wind', 'sand', 'rock', 'book', 'frog', 'gift', 'desk', 'mask', 'pond', 'sock', 'tent',
  'apple', 'beach', 'brain', 'bread', 'chair', 'cloud', 'crown', 'dance', 'eagle', 'flame', 'ghost', 'grape', 'honey', 'house', 'juice',
  'knife', 'light', 'magic', 'money', 'mouse', 'night', 'ocean', 'paint', 'piano', 'pizza', 'queen', 'river', 'robot', 'shark', 'smile',
  'snake', 'spoon', 'storm', 'sugar', 'tiger', 'train', 'water', 'whale', 'zebra', 'clock', 'dream', 'field', 'giant', 'horse', 'igloo',
  'jelly', 'koala', 'lunch', 'medal', 'nurse', 'olive', 'pearl', 'quilt', 'radio', 'sheep', 'tooth', 'video', 'world', 'youth', 'plant',
  'bridge', 'castle', 'forest', 'garden', 'orange', 'planet', 'silver', 'window', 'yellow', 'pencil', 'rocket', 'button', 'candle',
  'dragon', 'flower', 'guitar', 'jacket', 'kitten', 'ladder', 'market', 'monkey', 'pirate', 'pocket', 'puzzle', 'rabbit', 'sunset',
  'tennis', 'turtle', 'wizard', 'basket', 'bubble', 'camera', 'circle', 'coffee', 'cookie', 'desert', 'doctor', 'engine', 'finger',
  'hammer', 'island', 'jungle', 'lizard', 'summer', 'winter', 'spring', 'butter', 'carpet', 'dinner', 'fabric', 'galaxy', 'helmet',
  'insect', 'jersey', 'kettle', 'cherry', 'magnet', 'nickel', 'orchid', 'parrot', 'ribbon', 'saddle', 'ticket', 'violin', 'walnut',
];

/** A word's letters in alphabetical order: two words are anagrams of each other when these match. */
export const sortedLetters = (word: string): string => [...word].sort().join('');
