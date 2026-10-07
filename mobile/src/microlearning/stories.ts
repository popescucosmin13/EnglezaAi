import type { Cefr, Profile } from '../types';
import type { StoryEpisode } from './types';

interface StoryTemplate {
  id: string;
  title: string;
  sentences: string[];
  question: string;
  options: string[];
  answer: string;
  speakPrompt: string;
  targetPhrases: string[];
}

export interface StorySeries {
  id: string;
  title: string;
  description: string;
  episodes: StoryTemplate[];
}

const TECH_STORY: StorySeries = {
  id: 'friday-demo',
  title: 'The Friday Demo',
  description: 'O echipă IT pregătește o demonstrație importantă pentru un client.',
  episodes: [
    { id: 'demo-1', title: 'The message', sentences: ['Maya receives an urgent message from her manager.', 'The client wants a live demo on Friday.', 'The product works, but the team has only three days to prepare.', 'Maya decides to organize a short meeting.'], question: 'When does the client want the demo?', options: ['On Friday', 'Tomorrow morning', 'Next month'], answer: 'On Friday', speakPrompt: 'What should Maya discuss in the meeting?', targetPhrases: ['live demo', 'three days to prepare', 'organize a meeting'] },
    { id: 'demo-2', title: 'A hidden problem', sentences: ['During the meeting, Leo tests the login page.', 'He discovers that new users cannot reset their passwords.', 'The issue does not affect existing accounts.', 'The team agrees to fix it before working on the slides.'], question: 'What cannot new users do?', options: ['Reset their passwords', 'Open the slides', 'Join the meeting'], answer: 'Reset their passwords', speakPrompt: 'Explain which task the team should prioritize and why.', targetPhrases: ['discover an issue', 'existing accounts', 'fix it first'] },
    { id: 'demo-3', title: 'The difficult choice', sentences: ['The password fix takes longer than expected.', 'Maya can remove the feature from the demo or ask the client for more time.', 'Leo believes they can finish if they simplify one technical step.', 'Maya chooses the simpler version.'], question: 'What does Maya choose?', options: ['The simpler version', 'A different client', 'To cancel the demo'], answer: 'The simpler version', speakPrompt: 'Would you make the same choice? Explain.', targetPhrases: ['longer than expected', 'ask for more time', 'simplify a step'] },
    { id: 'demo-4', title: 'The rehearsal', sentences: ['On Thursday, the team rehearses the demo.', 'The first attempt takes twenty minutes, but the client has only ten.', 'Maya removes repeated explanations and keeps one clear example.', 'The second attempt finishes in nine minutes.'], question: 'How long is the second attempt?', options: ['Nine minutes', 'Ten minutes', 'Twenty minutes'], answer: 'Nine minutes', speakPrompt: 'How can someone make a presentation shorter and clearer?', targetPhrases: ['rehearse the demo', 'remove repeated explanations', 'clear example'] },
    { id: 'demo-5', title: 'A last-minute request', sentences: ['Two hours before the demo, the client asks about data security.', 'The current slides do not cover this topic.', 'Leo prepares one diagram while Maya updates her explanation.', 'They add the new section without changing the schedule.'], question: 'What topic does the client ask about?', options: ['Data security', 'The price', 'Vacation dates'], answer: 'Data security', speakPrompt: 'Describe how you would handle a last-minute request.', targetPhrases: ['last-minute request', 'cover this topic', 'update the explanation'] },
    { id: 'demo-6', title: 'The silence', sentences: ['The live demo starts well, but the screen suddenly freezes.', 'Maya stays calm and explains what the client should see.', 'Leo restarts the service in less than a minute.', 'The client appreciates their calm response.'], question: 'What happens to the screen?', options: ['It freezes', 'It becomes brighter', 'It shows the price'], answer: 'It freezes', speakPrompt: 'What should you say when technology fails during a presentation?', targetPhrases: ['stay calm', 'restart the service', 'calm response'] },
    { id: 'demo-7', title: 'The result', sentences: ['After the demo, the client sends detailed feedback.', 'They liked the simple workflow and the honest explanation of the problem.', 'They request a small pilot project for the following month.', 'The team celebrates, then writes down what they learned.'], question: 'What does the client request?', options: ['A pilot project', 'Another password', 'A longer meeting'], answer: 'A pilot project', speakPrompt: 'Summarize the whole story and its main lesson.', targetPhrases: ['detailed feedback', 'pilot project', 'write down what we learned'] },
  ],
};

const TRAVEL_STORY: StorySeries = {
  id: 'missing-backpack',
  title: 'The Missing Backpack',
  description: 'O călătorie simplă se transformă într-un mic mister.',
  episodes: [
    { id: 'bag-1', title: 'Arrival', sentences: ['Daniel arrives in Lisbon on a rainy afternoon.', 'At the hotel, he notices that his blue backpack is missing.', 'His passport is safe, but his camera and notebook are inside the bag.', 'He returns to the airport information desk.'], question: 'What color is the backpack?', options: ['Blue', 'Black', 'Red'], answer: 'Blue', speakPrompt: 'What should Daniel say at the information desk?', targetPhrases: ['my backpack is missing', 'inside the bag', 'information desk'] },
    { id: 'bag-2', title: 'The receipt', sentences: ['The airport employee asks for Daniel’s baggage receipt.', 'Daniel finds it in his jacket pocket.', 'The number shows that the backpack arrived in Lisbon.', 'Someone probably took it from the belt by mistake.'], question: 'Where does Daniel find the receipt?', options: ['In his jacket pocket', 'At the hotel', 'Inside the backpack'], answer: 'In his jacket pocket', speakPrompt: 'Explain what probably happened to the bag.', targetPhrases: ['baggage receipt', 'arrived in Lisbon', 'by mistake'] },
    { id: 'bag-3', title: 'A useful photo', sentences: ['Daniel remembers taking a photo before his flight.', 'The backpack is visible next to a bright green suitcase.', 'The employee searches the airport cameras for that suitcase.', 'It belongs to a passenger named Sofia.'], question: 'What is next to the backpack in the photo?', options: ['A green suitcase', 'A red chair', 'A camera'], answer: 'A green suitcase', speakPrompt: 'Describe a photo that could help find a lost object.', targetPhrases: ['is visible', 'next to', 'search the cameras'] },
    { id: 'bag-4', title: 'The phone call', sentences: ['The employee calls Sofia, who is still near the airport.', 'She checks her luggage and finds Daniel’s backpack on her trolley.', 'She apologizes and agrees to return immediately.', 'Daniel feels relieved.'], question: 'Where is Sofia?', options: ['Near the airport', 'In another country', 'At Daniel’s hotel'], answer: 'Near the airport', speakPrompt: 'Role-play Sofia’s apology.', targetPhrases: ['check the luggage', 'return immediately', 'feel relieved'] },
    { id: 'bag-5', title: 'One more problem', sentences: ['Sofia returns the backpack, but the camera is not inside.', 'Daniel checks every pocket twice.', 'Then he remembers using the camera in the airport café.', 'They walk to the café together.'], question: 'Where did Daniel last use the camera?', options: ['In the airport café', 'At the hotel', 'On the airplane'], answer: 'In the airport café', speakPrompt: 'Explain the new problem and the next step.', targetPhrases: ['check every pocket', 'remember using', 'walk to the café'] },
    { id: 'bag-6', title: 'The waiter', sentences: ['The waiter recognizes Daniel from the photo on the camera.', 'He kept the camera safely behind the counter.', 'Daniel proves that it is his by describing the last three photos.', 'The waiter gives it back.'], question: 'Where did the waiter keep the camera?', options: ['Behind the counter', 'In a suitcase', 'At the hotel'], answer: 'Behind the counter', speakPrompt: 'How can Daniel prove that the camera is his?', targetPhrases: ['recognize someone', 'behind the counter', 'give it back'] },
    { id: 'bag-7', title: 'A better evening', sentences: ['Daniel finally reaches his hotel with everything he brought.', 'He invites Sofia for coffee to thank her for returning the bag.', 'They laugh about the confusing afternoon.', 'The next morning, they explore Lisbon together.'], question: 'Why does Daniel invite Sofia for coffee?', options: ['To thank her', 'To sell the camera', 'To find the airport'], answer: 'To thank her', speakPrompt: 'Retell the story in your own words.', targetPhrases: ['thank someone for', 'laugh about', 'explore the city'] },
  ],
};

const EVERYDAY_STORY: StorySeries = {
  id: 'new-neighbor',
  title: 'The New Neighbor',
  description: 'O întâlnire obișnuită pornește o colaborare neașteptată.',
  episodes: [
    { id: 'neighbor-1', title: 'A noisy morning', sentences: ['Emma wakes up early because someone is moving furniture upstairs.', 'She meets her new neighbor, Noah, in the hallway.', 'He apologizes for the noise and introduces himself.', 'Emma offers to help with the heavy boxes.'], question: 'Why does Emma wake up early?', options: ['Because of the noise', 'Because she is traveling', 'Because Noah calls her'], answer: 'Because of the noise', speakPrompt: 'Introduce yourself to a new neighbor.', targetPhrases: ['move furniture', 'apologize for', 'offer to help'] },
    { id: 'neighbor-2', title: 'The old desk', sentences: ['One box contains an old wooden desk.', 'Noah wants to repair it, but he does not have the right tools.', 'Emma’s brother knows how to restore furniture.', 'She sends him a photo of the desk.'], question: 'Who knows how to restore furniture?', options: ['Emma’s brother', 'Noah’s manager', 'The landlord'], answer: 'Emma’s brother', speakPrompt: 'Ask someone for advice about repairing an object.', targetPhrases: ['wooden desk', 'right tools', 'send a photo'] },
    { id: 'neighbor-3', title: 'A surprising detail', sentences: ['Emma’s brother notices a small symbol under the desk.', 'The symbol belongs to a local workshop that closed fifty years ago.', 'The desk may be more valuable than Noah expected.', 'They decide not to paint it.'], question: 'Where is the symbol?', options: ['Under the desk', 'On a box', 'In the hallway'], answer: 'Under the desk', speakPrompt: 'Explain why they decide not to paint the desk.', targetPhrases: ['notice a symbol', 'more valuable than expected', 'decide not to'] },
    { id: 'neighbor-4', title: 'The workshop', sentences: ['Noah and Emma visit the address of the old workshop.', 'A small bookstore now occupies the building.', 'The owner recognizes the symbol and shows them an old photograph.', 'The same desk appears in the photograph.'], question: 'What is in the building now?', options: ['A bookstore', 'A restaurant', 'A workshop'], answer: 'A bookstore', speakPrompt: 'Describe what they discover at the old address.', targetPhrases: ['occupy the building', 'recognize the symbol', 'old photograph'] },
    { id: 'neighbor-5', title: 'The first owner', sentences: ['The photograph shows a writer named Clara Hayes.', 'She used the desk while writing her first novel.', 'The bookstore owner has several of her books.', 'Noah starts reading one that evening.'], question: 'Who used the desk?', options: ['Clara Hayes', 'Emma', 'The bookstore owner'], answer: 'Clara Hayes', speakPrompt: 'Tell someone why the desk is special.', targetPhrases: ['first owner', 'write a novel', 'start reading'] },
    { id: 'neighbor-6', title: 'A new plan', sentences: ['Noah carefully repairs the desk without changing its original style.', 'Emma documents each step with photographs.', 'The bookstore owner suggests displaying the desk for one weekend.', 'They agree to organize a small event.'], question: 'Where will they display the desk?', options: ['In the bookstore', 'In the hallway', 'In a museum abroad'], answer: 'In the bookstore', speakPrompt: 'Describe how they prepare the desk and the event.', targetPhrases: ['original style', 'document each step', 'organize an event'] },
    { id: 'neighbor-7', title: 'The event', sentences: ['Many people come to see the restored desk.', 'Emma presents the photographs, and Noah reads a page from Clara’s novel.', 'The event helps the bookstore attract new visitors.', 'The neighbors decide to restore another object together.'], question: 'What does Noah read?', options: ['A page from the novel', 'A travel ticket', 'A repair manual'], answer: 'A page from the novel', speakPrompt: 'Summarize the story and say what the neighbors gained.', targetPhrases: ['restored desk', 'attract visitors', 'work together'] },
  ],
};

export const STORY_SERIES = [TECH_STORY, TRAVEL_STORY, EVERYDAY_STORY];

export function preferredStorySeries(profile: Profile): StorySeries {
  const context = `${profile.mainObjective} ${profile.interests.join(' ')}`.toLowerCase();
  if (/travel|călător|calator|vacan/.test(context)) return TRAVEL_STORY;
  if (/tech|it|business|munc|job|profes/.test(context)) return TECH_STORY;
  return EVERYDAY_STORY;
}

export function adaptEpisode(series: StorySeries, index: number, level: Cefr): StoryEpisode {
  const template = series.episodes[index % series.episodes.length];
  const sentenceCount = level === 'A1' ? 2 : level === 'A2' ? 3 : template.sentences.length;
  const visible = template.sentences.slice(0, sentenceCount);
  const stopWords = new Set(['the', 'and', 'for', 'from', 'with']);
  const answerKeywords = template.answer.toLowerCase().split(/\s+/).filter((word) => word.length > 2 && !stopWords.has(word));
  const answerSentence = template.sentences.find((sentence) => answerKeywords.every((word) => sentence.toLowerCase().includes(word)));
  if (answerSentence && !visible.includes(answerSentence)) visible.push(answerSentence);
  const text = visible.join(' ');
  return {
    id: template.id,
    series: series.title,
    title: template.title,
    text,
    question: template.question,
    options: template.options,
    answer: template.answer,
    speakPrompt: template.speakPrompt,
    targetPhrases: template.targetPhrases,
  };
}
