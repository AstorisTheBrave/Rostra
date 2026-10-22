import { disconnectPrisma, getPrisma } from "@rostra/database";

async function main(): Promise<void> {
	const prisma = getPrisma();
	try {
		await prisma.guild.createMany({
			data: ["northstar", "atlas-studio", "sunday-guild"].map((id) => ({ id })),
			skipDuplicates: true,
		});
	} finally {
		await disconnectPrisma();
	}
}

main().catch((error) => {
	console.error("browser_fixture_seed_failed", error);
	process.exitCode = 1;
});
