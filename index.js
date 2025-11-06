import { urls as domains } from "./constants.js";
import { generateAndWriteAddressLists } from "./lib/githubMeta.js";
import {
  resolveUrls,
  writeHosts,
  writeAdditionalFiles,
} from "./lib/hosts.js";

/**
 * Main entry point for the application
 * Resolves domain names and updates hosts file
 */
const main = async () => {
  try {
    console.log('Starting hosts file update process...');
    const configs = await resolveUrls(domains);
    await writeHosts(configs);
    writeAdditionalFiles(configs);

    // Fetch GitHub meta and write IPv4/IPv6 lists
    await generateAndWriteAddressLists();
    
    console.log('Hosts file update completed successfully');
  } catch (error) {
    console.error('Failed to update hosts file:', error);
    process.exit(1);
  }
};

// Execute the main function
main();
