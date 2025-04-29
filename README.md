# Dataview Properties

Dataview Properties allows you to automatically copy Dataview inline fields (and their values, even calculated ones!) into frontmatter properties and keep them synchronized.

## ✨ Features
The plugin offers the following features:

- Conversion of Dataview queries (DQL and DataviewJS) to frontmatter
- Support for both block and inline queries
- Automatic synchronization based on a configurable interval
- Dedicated command to manually trigger synchronization
- Evaluation of calculated values before insertion into frontmatter

> [!WARNING]
> The Dataview plugin must be installed and activated in your Obsidian vault.

## ⚙️ Configuration
<screenshot>

- **Interval**: The time interval (in milliseconds) at which the plugin will check for changes in the Dataview queries and update the frontmatter properties accordingly. The default value is 1000ms (1 second).
- **Ignored fields** : A list (of string) of fields to ignore (aka that won't be copied). Separate the fields with a comma or a new line. To use regex, encapsulate with `/` (ex: `/^name$/i`). 
    - **Insensitive** : If checked, the plugin will ignore the case of the field names when checking for matches. For example, if you have a field named "Name" and you set "name" in the ignored fields, it will be ignored (and vice versa).
    - **Ignore accent** : If checked, the plugin will ignore accents when checking for matches. For example, if you have a field named "école" and you set "ecole" in the ignored fields, it will be ignored, and vice versa.
- **Dataview** : Enable/disable the evaluation of each type of dataview query. Only inline queries are supported.
    - **Dataview Query Language (DQL)**
    - **DataviewJS**

> [!CAUTION]
> Only string/numbers/date are supported in the frontmatter. When the evaluated queries returns a html, it will converted to markdown. 

## 🛠️ Usage
### Automatic synchronization
By default, the plugin automatically synchronizes the Dataview queries within the frontmatter (proprieties) at the interval defined in the settings.

### Manual command

You can also trigger the synchronization manually by using the command palette (<kbd>Ctrl</kbd>+<kbd>P</kbd> | <kbd>Cmd</kbd> + <kbd>P</kbd>) and searching for "Dataview Properties : Add the Dataview field to the frontmatter". This will force the plugin to check for changes in the Dataview queries and update the frontmatter properties accordingly.

> [!TIP]
> For a file containing:
> ```markdown
> ---
> name: "name"
> force: 12
> agility: 5
> ---
>
> # Hello world
> Vitality:: `$= this.force + this.agility`
> ```
> The plugin will update the file accordingly:
> ```markdown
> ---
> name: "name"
> force: 12
> agility: 5
> Vitality: 17
> ---
>
> # Hello world
> Vitality:: `$= this.force + this.agility`
> ```

The plugin also works with more complex queries, like links (and they will be converted to markdown links as `[[mylinks]]`), date or numbers.

> [!CAUTION]
> - Widget and function won't be added to the frontmatter.
> - HTML will be converted to markdown.

## 📥 Installation

- [ ] From Obsidian's community plugins
- [x] Using BRAT with `https://github.com/Mara-Li/obsidian-dataview-properties`
- [x] From the release page: 
    - Download the latest release
    - Unzip `dataview-properties.zip` in `.obsidian/plugins/` path
    - In Obsidian settings, reload the plugin
    - Enable the plugin


### 🎼 Languages

- [x] English
- [ ] French

To add a translation:
1. Fork the repository
2. Add the translation in the [`src/i18n/locales`](./src/i18n/locales) folder with the name of the language (ex: `fr.json`). 
    - You can get your locale language from Obsidian using [obsidian translation](https://github.com/obsidianmd/obsidian-translations) or using the commands (in templater for example) : `<% tp.obsidian.moment.locale() %>`
    - Copy the content of the [`en.json`](./src/i18n/locales/en.json) file in the new file
    - Translate the content
3. Edit `i18n/i18next.ts` :
    - Add `import * as <lang> from "./locales/<lang>.json";`
    - Edit the `ressource` part with adding : `<lang> : {translation: <lang>}`

