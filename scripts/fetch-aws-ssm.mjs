import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import fs from 'fs';

const isLocal = process.env.NODE_ENV === 'local' || process.env.NODE_ENV === 'development';
if (isLocal && !process.env.FORCE_AWS_SSM) {
  console.log('📄 Using local environment config (AWS SSM skipped)');
  process.exit(0);
}

const env = process.env.SSM_ENV || process.env.NODE_ENV || 'development';
console.log(`🔄 Fetching env from AWS SSM for hub on env [${env}]...`);

const ssmClient = new SSMClient({ region: process.env.AWS_REGION || 'ap-south-1' });

const platformPath = `/sms-hub/${env}/`;

const fetchParams = async (path) => {
  let nextToken = undefined;
  const allParams = [];
  try {
    do {
      const command = new GetParametersByPathCommand({
        Path: path,
        WithDecryption: true,
        Recursive: true,
        NextToken: nextToken,
      });
      const response = await ssmClient.send(command);
      if (response.Parameters) {
        allParams.push(...response.Parameters);
      }
      nextToken = response.NextToken;
    } while (nextToken);
  } catch (err) {
    if (err.name === 'ParameterNotFound' || err.name === 'AccessDeniedException') {
       console.warn(`Warning: Could not fetch path ${path} - ${err.message}`);
    } else {
       throw err;
    }
  }
  return allParams;
};

const run = async () => {
   try {
      const platformParams = await fetchParams(platformPath);

      if (platformParams.length === 0) {
         console.warn("⚠️ No parameters found in SSM.");
      }

      let envContent = '';
      
      const processParam = (param, prefix) => {
         if (!param.Name || !param.Value) return;
         const key = param.Name.replace(prefix, '');
         if (key.includes('/')) return;
         envContent += `${key}="${param.Value}"\n`;
      };
      
      platformParams.forEach(p => processParam(p, platformPath));

      if (process.env.PORT && !envContent.includes('PORT=')) {
         envContent += `PORT=${process.env.PORT}\n`;
      }
      if (process.env.NODE_ENV && !envContent.includes('NODE_ENV=')) {
         envContent += `NODE_ENV=${process.env.NODE_ENV}\n`;
      }

      fs.writeFileSync('.env', envContent);
      console.log('✅ Generated .env from AWS SSM parameters.');
   } catch (err) {
      console.error('❌ Failed to fetch from AWS SSM', err);
      process.exit(1);
   }
};

run();
