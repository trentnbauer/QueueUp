/** Everyday five and six letter words the Anagram game scrambles. Lower case, letters only. */
export const ANAGRAM_WORDS: readonly string[] = [
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
