sfdx-codescan-plugin
=============

Run CodeScan or SonarQube jobs from sfdx

[![Version](https://img.shields.io/npm/v/sfdx-codescan-plugin.svg)](https://npmjs.org/package/sfdx-codescan-plugin)
[![Downloads/week](https://img.shields.io/npm/dw/sfdx-codescan-plugin.svg)](https://npmjs.org/package/sfdx-codescan-plugin)
[![License](https://img.shields.io/npm/l/sfdx-codescan-plugin.svg)](https://github.com/codescan-io/sfdx-codescan-plugin/blob/master/package.json)

## Install
To install the plugin use `sfdx plugins:install sfdx-codescan-plugin`.
You'll be prompted that this plugin is not signed by Salesforce, type `y` to continue.
Check the installation using `sfdx plugins`.

## Docs
* Use `sfdx help codescan:run` to view a list of parameters and flags. 
* Visit [Autorabit Knowledgebase](https://knowledgebase.autorabit.com/product-guides/codescan/codescan-integration/codescan-sfdx-plugin/run-analysis-locally-using-sfdx) for more information.


## Usage
```
  $ sfdx codescan:run [name=value...] [-s <string>] [-o <string>] [-k <string>] [-t <string>] [-u <string>] [-p 
  <string>] [--noqualitygate] [--javahome <string>] [--nofail] [--qgtimeout <integer>] [--json] [--loglevel 
  trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL]

OPTIONS
  -k, --projectkey=projectkey                                                       sonar.projectKey - the project key
                                                                                    to create.

  -o, --organization=organization                                                   CodeScan Organization Id. Only
                                                                                    required when connecting to CodeScan
                                                                                    Cloud

  -p, --password=password                                                           SonarQube password (token is
                                                                                    preferred)

  -s, --server=server                                                               SonarQube server. Defaults to
                                                                                    CodeScan Cloud
                                                                                    (https://app.codescan.io)

  -t, --token=token                                                                 SonarQube token (preferred)

  -u, --username=username                                                           SonarQube username (token is
                                                                                    preferred)

  --javahome=javahome                                                               JAVA_HOME to use

  --json                                                                            format output as json

  --loglevel=(trace|debug|info|warn|error|fatal|TRACE|DEBUG|INFO|WARN|ERROR|FATAL)  [default: warn] logging level for
                                                                                    this command invocation

  --nofail                                                                          Don't fail if sonar-scanner fails

  --noqualitygate                                                                   Don't wait until the SonarQube
                                                                                    background task is finished and
                                                                                    return the build Quality Gate

  --qgtimeout=qgtimeout                                                             Timeout in seconds to wait for
                                                                                    Quality Gate to complete (default
                                                                                    300)
```
## Examples
```
  $ sfdx codescan:run --token <token> --projectkey my-project-key --organization my-org-key
  
  $ sfdx codescan:run --token <token> --projectkey my-project-key --organization my-org-key -Dsonar.verbose=true
       -D can be used for passing any sonar-scanner definition
       -J will be passed as a jvm arg
  
  $ sfdx codescan:run ... -X
       Verbose output
```

