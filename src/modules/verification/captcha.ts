/**
 * A trivial bot-gate captcha: a small addition question with four answer
 * buttons. Correctness is encoded in the button id (`ok`/`no`), which is enough
 * to stop unattended self-bots without a heavyweight image/modal flow.
 */

export interface Captcha {
	question: string; // e.g. "3 + 4"
	options: Array<{ label: string; correct: boolean }>;
}

const randInt = (max: number, rng: () => number) => Math.floor(rng() * max);

/** Build a `a + b` question with one correct and three distinct wrong options, shuffled. */
export function makeCaptcha(rng: () => number = Math.random): Captcha {
	const a = randInt(9, rng) + 1;
	const b = randInt(9, rng) + 1;
	const answer = a + b;

	const wrong = new Set<number>();
	while (wrong.size < 3) {
		const delta = randInt(7, rng) - 3; // -3..3
		const candidate = answer + delta;
		if (candidate !== answer && candidate > 0) wrong.add(candidate);
	}

	const options = [
		{ label: String(answer), correct: true },
		...[...wrong].map((n) => ({ label: String(n), correct: false })),
	];

	// Fisher-Yates shuffle so the correct answer is not always first.
	for (let i = options.length - 1; i > 0; i--) {
		const j = randInt(i + 1, rng);
		[options[i], options[j]] = [
			options[j] as (typeof options)[number],
			options[i] as (typeof options)[number],
		];
	}

	return { question: `${a} + ${b}`, options };
}
