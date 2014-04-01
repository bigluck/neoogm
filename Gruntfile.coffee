module.exports = (grunt) ->
	grunt.initConfig
		pkg: grunt.file.readJSON 'package.json'
		usebanner:
			options:
				banner: """
					/**
					 * <%= pkg.name %> <%= pkg.version %> <https://github.com/bigluck/neoogm>
					 * <%= pkg.description %>
					 *
					 * Available under MIT license <https://github.com/bigluck/neoogm/raw/master/LICENSE>
					 */
					"""
				position: 'top'
				linkbreak: true
			dist:
				files:
					'lib/index.js': 'lib/index.js'
		coffee:
			dist:
				files:
					'lib/index.js': 'src/index.coffee'

	grunt.loadNpmTasks 'grunt-contrib-coffee'
	grunt.loadNpmTasks 'grunt-banner'

	grunt.registerTask 'default', [
		'coffee'
		'usebanner'
	]
	grunt.registerTask 'dist', [
		'coffee'
		'usebanner'
	]
