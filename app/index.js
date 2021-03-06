'use strict';
// Vendor
var chalk   = require('chalk');
var util    = require('util');
var yeoman  = require('yeoman-generator');
var yosay   = require('yosay');
var wp      = require('wp-cli');
var clone   = require('git-clone');
var replace = require('replace');
var fs      = require('fs');
var rm      = require('rimraf');

// Custom
var github  = require('./github_user');
var helpers = require('./helpers');

var Generator = module.exports = function(){
  yeoman.generators.Base.apply(this, arguments);
};

util.inherits(Generator, yeoman.generators.Base);

Generator.prototype.prompting = function(){
  var done = this.async();

  this.log(yosay(
    'Welcome to the ' + chalk.blue('Microcebus') + ' WordPress generator!'
  ));

  var prompts = [
  {
    type: 'input',
    name: 'githubUser',
    message: 'What\'s your GitHub username (for theme author info)?',
    store   : true
  },
  {
    type: 'input',
    name: 'themeName',
    message: 'Theme Name',
    default: helpers.capitalize(this.appname)
  },
  {
    type: 'input',
    name: 'themeURI',
    message: 'Theme Template GitHub Address',
    default: helpers.SETTINGS.DEFAULT_THEME_URI
  },
  {
    type: 'input',
    name: 'themeSlug',
    message: 'Theme Slug',
    default: this.appname
  },
  {
    type: 'input',
    name: 'themeDesc',
    message: 'Theme Description',
    default: 'A Custom WordPress theme created for ' + helpers.capitalize(this.appname)
  }];

  this.prompt(prompts, function(props){
    this.props = props;
    done();
  }.bind(this));
};

Generator.prototype.configuring = function(){
  var done = this.async();

  github(
    this.props.githubUser,
    function(res){
      this.realname  = res.name;
      this.email     = res.email;
      this.githubUrl = res.html_url;
      done();
    }.bind(this),
    this.log
  );
};

Generator.prototype.getWordPress = function(){
  var done     = this.async();
  var themeURI = this.props.themeURI;
  var themeDir = './wp-content/themes/' + this.props.themeSlug;

  var downloadTheme = (function(){
    this.log('Cloning theme from ' + themeURI + ' ...');

    clone(themeURI, themeDir, (function(){
      //this.log('Removing theme .git submodule...');

      // Remove .git folder inside of theme
      rm(themeDir + '/.git', (function(){
        this.log('Customizing theme files...');
      }).bind(this));

      // Update theme files if Underscores theme
      if (themeURI === helpers.SETTINGS.DEFAULT_THEME_URI){

        // Rename _s.pot language file
        fs.rename(
          themeDir + '/languages/_s.pot',
          themeDir + '/languages/' + this.props.themeSlug + '.pot',
          function(err) {
          if ( err ) {
            console.log('ERROR: ' + err);
          }
        });

        // Find/replace pattern for theme slug (ie. '_s')
        // https://github.com/Automattic/_s#getting-started
        replace({
          regex: '\'_s\'',
          replacement: '\'' + this.props.themeSlug + '\'',
          paths: [themeDir],
          recursive: true,
          silent: true,
        });

        replace({
          regex: '_s_',
          replacement: this.props.themeSlug + '_',
          paths: [themeDir],
          recursive: true,
          silent: true,
        });

        replace({
          regex: 'Text Domain: _s',
          replacement: 'Text Domain: ' + this.props.themeSlug,
          paths: [themeDir],
          recursive: true,
          silent: true,
        });

        replace({
          regex: ' _s',
          replacement: ' ' + this.props.themeName,
          paths: [themeDir],
          recursive: true,
          silent: true,
        });

        replace({
          regex: '_s-',
          replacement: this.props.themeSlug + '-',
          paths: [themeDir],
          recursive: true,
          silent: true,
        });
      }
    }).bind(this));
  }).bind(this);

  var configureWordPress = (function(){
      this.log('Making our custom theme the default theme...');

      fs.createReadStream('./wp-config-sample.php').pipe(fs.createWriteStream('./wp-config.php'));

      var endOfConfig  = /\$table_prefix = \'wp_\'\;/;
      var defaultTheme = 'define( \'WP_DEFAULT_THEME\', \'' + this.props.themeSlug + '\' );';

      replace({
        regex: endOfConfig,
        replacement: '$table_prefix = \'wp_\';\n' + defaultTheme,
        paths: ['./wp-config.php'],
        recursive: false,
        silent: true,
      });
  }).bind(this);

  wp.discover((function(wp){
    wp.cli.info((function(err, info){
      if (err){
        this.log('WP CLI is not installed or configured properly!');
        this.log('Please install: http://wp-cli.org/#install');
        done(err);
      }
    }).bind(this));

    wp.core.download((function(err, result){
      if (err){
        done(err);
      }

      this.log(result);

      configureWordPress();

      downloadTheme();

      done();

    }).bind(this));

  }).bind(this));

};

Generator.prototype.writing = {
  templates: function(){
    var userinfo = {
      appName: this.props.themeName,
      appSlug: this.props.themeSlug,
      appDesc: this.props.themeDesc,
      authorName: this.realname,
      authorEmail: this.email,
      authorURL: this.githubUrl
    };

    this.fs.copyTpl(
      this.templatePath('_package.json'),
      this.destinationPath('package.json'),
      userinfo
    );
    this.fs.copyTpl(
      this.templatePath('_bower.json'),
      this.destinationPath('bower.json'),
      userinfo
    );
    this.fs.copyTpl(
      this.templatePath('_bowerrc'),
      this.destinationPath('.bowerrc'),
      userinfo
    );
    this.fs.copyTpl(
      this.templatePath('_gitignore'),
      this.destinationPath('.gitignore'),
      userinfo
    );
    this.fs.copyTpl(
      this.templatePath('_README.md'),
      this.destinationPath('README.md'),
      userinfo
    );
    this.fs.copyTpl(
      this.templatePath('_Gruntfile.js'),
      this.destinationPath('Gruntfile.js'),
      userinfo
    );
  },

  staticFiles: function () {
    this.fs.copy(
      this.templatePath('editorconfig'),
      this.destinationPath('.editorconfig')
    );
    this.fs.copy(
      this.templatePath('plugins'),
      this.destinationPath('plugins')
    );
    this.fs.copy(
      this.templatePath('scripts/'),
      this.destinationPath('scripts/')
    );
  }
};

Generator.prototype.install = function(){
  this.installDependencies();
};

Generator.prototype.end = function(){
  var settings = (function(){
    var assets = 'wp-content/themes/' + this.props.themeSlug + '/assets';

    // Confirm directory exists
    try {
      var directory = fs.lstatSync(assets);

      if (directory.isDirectory()) {
        this.log('Copying Foundation\'s _settings.scss to \'' + assets + '/scss/\' ...');

        fs.createReadStream(assets + '/vendor/foundation-sites/scss/settings/_settings.scss')
          .pipe(fs.createWriteStream(assets + '/scss/_settings.scss'));
      }
    }
    catch (e) {
      this.log(e);
    }
  }).bind(this);

  settings();

  this.log('Done! Happy coding!');
};
