import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfError } from '@salesforce/core';
import { AnyJson, JsonMap } from '@salesforce/ts-types';
import {spawn} from 'child_process';
import * as fs from 'fs';
import * as Path from 'path';
import {pollQualityGate} from '../../lib/qualitygate';
import {resolveRequirements} from '../../lib/requirements';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('sfdx-codescan-plugin', 'codescan');

export default class Run extends SfdxCommand {

  public static description = messages.getMessage('runCommandDescription');

  public static examples = [
  `$ sfdx codescan:run --token <token> --projectkey my-project-key --organization my-org-key
  `,
  `$ sfdx codescan:run --token <token> --projectkey my-project-key --organization my-org-key -Dsonar.verbose=true
    -D can be used for passing any sonar-scanner definition
    -J will be passed as a jvm arg
  `,
  `$ sfdx codescan:run ... -X
    Verbose output`
  ];

  public static args = [];

  protected static varargs = true;

  protected static flagsConfig = {
    // flag with a value (-n, --name=VALUE)
    server: flags.string({char: 's', description: messages.getMessage('serverFlagDescription')}),
    serverOverride: flags.string({description: messages.getMessage('serverOverrideFlagDescription')}),
    organization: flags.string({char: 'o', description: messages.getMessage('organizationFlagDescription')}),

    projectkey: flags.string({char: 'k', description: messages.getMessage('projectKeyFlagDescription')}),

    token: flags.string({char: 't', description: messages.getMessage('tokenFlagDescription')}),
    username: flags.string({char: 'u', description: messages.getMessage('usernameFlagDescription')}),
    password: flags.string({char: 'p', description: messages.getMessage('passwordFlagDescription')}),

    noqualitygate: flags.boolean({description: messages.getMessage('noqualitygateFlagDescription')}),

    javahome: flags.string({description: messages.getMessage('javahomeFlagDescription')}),
    nofail: flags.boolean({description: messages.getMessage('nofailFlagDescription')}),
    qgtimeout: flags.integer({description: messages.getMessage('qgtimeoutFlagDescription')})
  };

  private static SONAR_SCANNER_VERSION = '5.0.1.3007';

  protected varargValues = [];
  protected codescanPath = null;

  public async run(): Promise<AnyJson> {
    const varargs = this.varargValues.slice();
    const command = await this.resolveJava(this.flags.javahome);
    let args = [];

    if (this.contains(varargs, '-Dsonar.host.url')) {
      // skip
    } else if (!this.flags.server) {
      this.flags.server = 'https://app.codescan.io';
    } else if (!this.flags.server.match(/https?:\/\/[A-Za-z0-9\-_]+(\..+|:[0-9]+\/*.*|\/.*)/)) {
      throw new SfError(messages.getMessage('errorInvalidServerUrl'));
    }
    if (this.flags.server && this.flags.server.endsWith('codescan.io') && !this.flags.organization) {
      throw new SfError(messages.getMessage('errorNoOrganization'));
    }

    // put -J vm args at front...
    for ( const x in varargs) {
      if (varargs[x].startsWith('-J')) {
        args.push(varargs[x].substring(2));
      }
    }

    // jar
    args.push('-jar');
    args.push(await this.resolveSonarScanner());

    // server
    if (this.flags.server) {
      if (this.contains(varargs, '-Dsonar.host.url')) {
        throw new SfError(messages.getMessage('errorDuplicateValues', ['server']));
      }
      args.push('-Dsonar.host.url=' + this.flags.server );
    }
    if (this.flags.organization) {
      if (this.contains(varargs, '-Dsonar.organization')) {
        throw new SfError(messages.getMessage('errorDuplicateValues', ['organization']));
      }
      args.push( '-Dsonar.organization=' + this.flags.organization );
    }

    // authentication
    if (this.contains(varargs, '-Dsonar.login') || this.contains(varargs, '-Dsonar.password')) {
      if (this.flags.token || this.flags.username && this.flags.password) {
        throw new SfError(messages.getMessage('errorDuplicateValues', ['token/username/password']));
      }
    } else if (this.flags.token) {
      if (this.flags.username || this.flags.password) {
        throw new SfError(messages.getMessage('errorTokenAndUserPass'));
      }
      args.push( '-Dsonar.login=' + this.flags.token );
    } else if (this.flags.username && this.flags.password) {
      args.push( '-Dsonar.login=' + this.flags.username );
      args.push( '-Dsonar.password=' + this.flags.password );
    } else if (this.flags.username || this.flags.password) {
      throw new SfError(messages.getMessage('errorOnlyUserOrPass'));
    } else {
      this.ux.log('No --token specified. This will probably fail');
    }

    if (this.flags.projectkey) {
      if (this.contains(varargs, '-Dsonar.projectKey')) {
        throw new SfError(messages.getMessage('errorDuplicateValues', ['projectkey']));
      }
      args.push('-Dsonar.projectKey=' + this.flags.projectkey);
    }

    // setup working dir
    let sonarWorkingDir = this.contains(varargs, '-Dsonar.working.directory=');
    if (sonarWorkingDir) {
      sonarWorkingDir = sonarWorkingDir.substring('-Dsonar.working.directory='.length);
    } else {
      sonarWorkingDir = Path.join(this.codescanPath, 'sonarworker');
      args.push('-Dsonar.working.directory=' + sonarWorkingDir);
    }

    // add rest of varargs
    for ( const x in varargs) {
      if (!varargs[x].startsWith('-J')) {
        args.push(varargs[x]);
      }
    }

    // spawn scanner
    this.ux.log(`\nRunning command \n[${command}] \nwith arguments \n${args.join('\n')}\n`);

    const cmd = spawn(command, args);
    cmd.stdout.pipe(process.stdout);
    cmd.stderr.pipe(process.stderr);
    const nofail = !!this.flags.nofail;
    const noqualitygate = !!this.flags.noqualitygate;

    const getQualityGate = this.getQualityGate;
    const _this = this;
    return new Promise((resolve, reject) => {
      cmd.addListener('exit', code => {
        if (code === 0 && !noqualitygate) {
          _this.ux.startSpinner('Waiting for SonarQube Background Task...');
          return getQualityGate(_this, sonarWorkingDir)
          .catch(error => {
            _this.ux.stopSpinner();
            if (_this.flags.nofail) {
              return resolve({code: 0, error});
            } else {
              return reject(error);
            }
          })
          .then(ret => {
            if (!ret) {
              return;
            }
            _this.ux.stopSpinner();
            return _this.printQualityGate(ret, nofail, resolve, reject);
          });
        } else if (code === 0 || nofail) {
          resolve({code});
        } else {
          reject({code});
        }
      });
    });
  }

  protected parseVarargs(args?: string[]): JsonMap {
    this.varargValues = args;
    return {};
  }

  private printQualityGate(qualitygate, nofail, resolve, reject) {
    const chalk = require('chalk');
    let code = 0;
    if (qualitygate['status'] === 'OK') {
      this.ux.log(chalk.green('Quality Gate passed'));
    } else {
      this.ux.error(chalk.red('Quality Gate failed'));
      this.ux.error(chalk.red('See more details on the dashboard URL above'));
      code = 1;
      if (!nofail) return reject('Quality Gate failed');
    }
    return resolve({code, qualitygate});
  }
  private getQualityGate(_this, sonarWorkingDir) {
    const qgtimeout = _this.flags.qgtimeout ? parseInt(_this.flags.qgtimeout, 10) : 300;
    const end = new Date().getTime() + (qgtimeout * 1000);
    const auth = _this.flags.token ? _this.flags.token : (_this.flags.username && _this.flags.password ? {user: _this.flags.username, pass: _this.flags.password} : {});
    const serverOverride = _this.flags.serverOverride;
    return new Promise((resolve, reject) => {
      pollQualityGate(auth, end, sonarWorkingDir, 2000, serverOverride, resolve, reject);
    });
  }

  private resolveJava(javaHome) {
    return resolveRequirements(javaHome)
    .catch(error => {
      throw error;
    })
    .then(requirements => {
      return requirements.javaHome + '/bin/java';
    });
  }

  private resolveSonarScanner() {

    // create parent dirs
    if (!fs.existsSync(Path.normalize('.sfdx/'))) {
      fs.mkdirSync(Path.normalize('.sfdx/'));
    }
    this.codescanPath = this.codescanPath = Path.normalize('.sfdx/codescan');
    if (!fs.existsSync(this.codescanPath)) {
      fs.mkdirSync(this.codescanPath);
    }

    // copy sonar scanner from assets folder
    const copydir = require('copy-dir');

    const sonarScannerSourcePath = Path.normalize(__dirname + '../../../../assets');

    this.ux.log(`Copying sonar scanner binaries from [${sonarScannerSourcePath}]...`);

    copydir.sync(sonarScannerSourcePath, '.sfdx/codescan', {
      utimes: true,  // keep add time and modify time
      mode: true,    // keep file mode
      cover: true    // cover file when exists, default is true
    });


    return Path.join(this.codescanPath, 'sonar-scanner-' + Run.SONAR_SCANNER_VERSION + '/lib/sonar-scanner-cli-' + Run.SONAR_SCANNER_VERSION + '.jar');
  }

  private contains(arr, prefix) {
    for ( const x in arr) {
      if (arr[x].startsWith(prefix)) {
        return arr[x];
      }
    }
    return false;
  }
}
