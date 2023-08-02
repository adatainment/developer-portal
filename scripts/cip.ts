import * as fs from "fs";
import * as path from "path";
import {
  getStringContentAsync,
  getBufferContentAsync,
  preventH1Headline,
} from "./reusable";
import {
  cip_repo_raw_base_url,
  cip_readme_url,
  cip_readme_regex,
  cip_regex,
  cip_docs_path,
  cip_static_resource_path,
  cip_source_repo,
  cip_repo_base_url,
  custom_edit_url
} from "./constants";

// Current pathname
const path_name = path.basename(__filename);

// Download markdown resources
const processCIPContentAsync = async (cip_name: string, content: string) => {
  const cip_resource = content.match(cip_regex);
  if (cip_resource) {
    await Promise.all(
      cip_resource.map(async (r) => {
        if (r.indexOf("http://") < 0 && r.indexOf("https://") < 0) {

          // Create modified file_names in case we want to store files
          // with a different ending, like JSON files
          const modified_file_name = r
            .replace("](", "")
            .replace(".png)", ".png")
            .replace(".jpg)", ".jpg")
            .replace(".jpeg)", ".jpeg")
            .replace(".json)", ".json");

          // Use the path.join method to concatenate paths, which should resolve the issue with  
          // additional ./ segments in the paths and allow the script to correctly find the file locations
          let relativePath = modified_file_name.replace("](", "");

          const fullPath = path.join(cip_repo_raw_base_url, cip_name, relativePath);
          const buffer = await getBufferContentAsync(fullPath);
          
          const targetDir = path.join('.', cip_static_resource_path, cip_name, path.dirname(relativePath));
          const targetFile = path.join(targetDir, path.basename(relativePath));

          try {
            // Create the target directory if it doesn't exist
            if (!fs.existsSync(targetDir)) {
              fs.mkdirSync(targetDir, { recursive: true });
            }

            fs.writeFileSync(targetFile, new Uint8Array(buffer));

            console.log(`Processed CIP content downloaded to ${targetFile}`);

          } catch (error) {
            console.error(`ERROR: Failed to download and save resource ${modified_file_name} for CIP ${cip_name}: ${error.message}`);
          }

          // Rewrite link to static folder
          content = content.replace(
            modified_file_name,
            `../../..${cip_static_resource_path}${cip_name}/${modified_file_name}`
          );
        }
      })
    );
  }

  // Ensure compatibility
  content = stringManipulation(content, cip_name); 

  return content;
};

// Clear up this is auto generated file from CIP repository
const injectAutogeneratedMessage = (content: string, file_name: string, path: string) => {
  
  const status = getDocTag(content, "Status");
  const type = getDocTag(content, "Type");
  const creationDate = getDocTag(content, "Created");

  return (
    content +
    "\n" +
    "## CIP Information  \nThis [" +
    type +
    "](CIP-0001#cip-format-and-structure) " +
    file_name +
    " created on **" +
    creationDate +
    "** has the status: [" +
    status +
    "](CIP-0001#cip-workflow).  \nThis page was generated automatically from: [" +
    cip_source_repo +
    "](" +
    cip_repo_base_url +
    file_name +
    cip_readme_url +
    ")."
  );
}

// Inject Docusaurus doc tags for title and add a nice sidebar
const injectDocusaurusDocTags = (content: string) => {

    // Remove '---' from doc to add it later
    content = content.substring(0, 3) === "---" ? content.slice(3) : content;

    // Parse information from markdown file
    const title = getDocTag(content, "Title");
    const cip_number = getDocTag(content, "CIP");

    // Add "---" with doc tags for Docusaurus
    content =
      "--- \nsidebar_label: " + "(" + cip_number + ") " + title + custom_edit_url + content;

    // Temporary solution!
    // CIP script needs to be rebuild, currently CIP 49 has useless information in header that will be removed in the future
    content = content.replace('* License: \n* License-Code:\n* Post-History:\n* Requires:\n* Replaces:\n* Superseded-By:\n', '')

    return content;
}

// String manipulations to ensure compatibility
const stringManipulation = (content: string, cip_name: string) => {
  // We expect markdown files, therefore strip HTML
  content = content.replace(/(<([^>]+)>)/gi, "");

  // Rewrite relative links like [Byron](./Byron.md) to absolute links.
  content = content.replace(
    /\]\(\.\//gm,
    "](" + cip_repo_raw_base_url + cip_name + "/"
  );

  // Fix parent links to CIPs
  content = content.replace(/]\(\..\/CIP-/gm, "](./CIP-");

  // Remove invalid "CIP-YET-TO-COME" links that are empty
  content = content.replace("]()", "]");

  // Remove unterminated string constant like in CIP 30
  content = content.replace(/\\/g, "");

  // Prevent H1 headlines
  content = preventH1Headline(content, "Abstract");
  content = preventH1Headline(content, "Motivation");
  content = preventH1Headline(content, "Specification");
  content = preventH1Headline(content, "Rationale");
  content = preventH1Headline(content, "Copyright");

  // Inject Docusaurus doc tags for title and add a nice sidebar
  content = injectDocusaurusDocTags(content);

  // Clear up this is auto generated file from CIP repository
  content = injectAutogeneratedMessage(content, cip_name, path_name);

  // Temporary solution!
  // Fix for CIP 60
  // Replace link to actual file on github. (Fix asap, when taking care of scripts)
  content = content.replace('cddl/version-1.cddl', 'https://github.com/cardano-foundation/CIPs/blob/master/CIP-0060/cddl/version-1.cddl');
  
  return content;
};

// Get a specific doc tag
const getDocTag = (content: string, tag_name: string) => {
  return content.match(new RegExp(`(?<=${tag_name}: ).*`, ""));
};

const main = async () => {
  console.log("CIP Content Downloading...");
  // Use https://raw.githubusercontent.com/cardano-foundation/CIPs/master/README.md as entry point to get URLs
  const readme_content = await getStringContentAsync(
    `${cip_repo_raw_base_url}${cip_readme_url}`
  );
  const cip_urls = readme_content.match(cip_readme_regex);
  const cip_urls_unique = [...new Set(cip_urls)];

  if (fs.existsSync(cip_docs_path)) {
    fs.rmSync(cip_docs_path, { recursive: true });
  }
  fs.mkdirSync(cip_docs_path, { recursive: true });

  // Save CIP Readme into docs
  await Promise.all(
    cip_urls_unique.map(async (cip_url) => {
      const file_name: string = "README.md";
      const cip_name: string = cip_url.slice(-2) === '/)' ? cip_url.slice(0, -2) : cip_url.slice(0, -1)

      let content = await getStringContentAsync(
        cip_repo_raw_base_url + '/' + cip_name + '/' + file_name
      );
      content = await processCIPContentAsync(cip_name, content);

      fs.writeFileSync(`${cip_docs_path}/${cip_name}.md`, content);
      console.log(`Downloaded to ${cip_docs_path}/${cip_name}.md`);
    })
  );

  console.log("CIP Content Downloaded");
};

main();
