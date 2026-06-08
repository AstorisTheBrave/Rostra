# Publishing these pages to the GitHub wiki

The wiki and Discussions are both enabled on the repository. Discussions are already live (see the Welcome
post). The wiki pages live here in the repo as the source of truth; GitHub requires one manual step to seed
a brand new wiki before it can be pushed to, because there is no API to create the first page.

## One time publish

1. Open https://github.com/AstorisTheBrave/Rostra/wiki and click "Create the first page". Save anything
   (the content will be replaced in the next step). This initializes the wiki git repository.

2. From this repo, push every page from `docs/wiki/` to the wiki:

   ```bash
   git clone https://github.com/AstorisTheBrave/Rostra.wiki.git /tmp/rostra-wiki
   cp docs/wiki/Home.md docs/wiki/Getting-Started.md docs/wiki/Commands.md \
      docs/wiki/Localization.md docs/wiki/Hybrid-Sharding.md docs/wiki/Feature-Flags.md \
      docs/wiki/Deploying.md /tmp/rostra-wiki/
   cd /tmp/rostra-wiki
   git add -A && git commit -m "Publish wiki pages" && git push
   ```

That is it. After the first seed, future updates are just edit `docs/wiki/*.md` and repeat step 2 (or edit
in the wiki UI). File names map to wiki page titles, and `[[Page Name]]` links work between pages.
