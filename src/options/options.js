'use strict';

var prefDefaults =
{
	items: [],
	lineNumbers: false,
	validate: true,
};

Promise.all(
[
	browser.storage.local.get(prefDefaults),
	browser.management.getAll(),
]).then(function (values)
	{
	var [prefs, extensionInfos] = values;
	
	/**
	 * Use CSS transitions to display a newly-created box.
	 */
	var animateFadeIn = function (node, callback)
	{
		var height = node.offsetHeight;
		node.classList.add('fade-in');
		
		window.setTimeout(function ()
		{
			node.classList.remove('fade-in');
			node.style.height = height+'px';
			
			window.setTimeout(function ()
			{
				node.style.height = null;
				
				if (callback !== undefined)
				{
					callback();
				}
			}, 500);
		}, 0);
	};
	
	/**
	 * Use CSS transitions to hide a box prior to removal.
	 */
	var animateFadeOut = function (node, callback)
	{
		node.style.height = node.offsetHeight+'px';
		node.style.pointerEvents = 'none';
		
		window.setTimeout(function ()
		{
			node.classList.add('fade-out');
			node.style.height = null;
			
			window.setTimeout(function ()
			{
				if (callback !== undefined)
				{
					callback();
				}
			}, 500);
		}, 20);
	};
	
	/**
	 * Add a new menu item and its configuration UI.
	 */
	var createItem = function (properties)
	{
		++lastId;
		var item =
		{
			checked: false,
			code: '',
			contexts: [],
			enabled: true,
			icons: null,
			id: lastId,
			patterns: '',
			scope: 'content',
			title: '',
			type: 'normal',
		};
		
		if (properties !== undefined)
		{
			Object.assign(item, properties);
		}
		
		prefs.items.push(item);
		var itemNode = createItemNode(item);
		itemListNode.appendChild(itemNode);
		animateFadeIn(itemNode);
		save();
	};
	
	/**
	 * Create the UI for configuring a single menu item.
	 *
	 * Returns the item node, not yet inserted into the page.
	 */
	var createItemNode = function (item)
	{
		var itemNode = templateNode.cloneNode(true);
		itemNode.querySelector('.item-content').dataset.itemId = item.id;
		itemNode.classList.add('type-'+item.type);
		var itemNonce = -1;
		
		// Adapt the template for the relevant item type (normal/separator/etc.)
		
		var removeSelectors = [];
		
		switch (item.type)
		{
		case 'separator':
			removeSelectors.push('.title-container', '.code-container', '.scope-container');
			itemNode.querySelector('.delete-button').textContent = 'Delete Separator';
			break;
		}
		
		if (item.type != 'separator')
		{
			removeSelectors.push('.separator-title-container');
		}
		
		if (removeSelectors.length > 0)
		{
			itemNode.querySelectorAll(removeSelectors.join(', ')).forEach(function (node)
			{
				node.parentNode.removeChild(node);
			});
		}
		
		// Add save-on-edit events for basic fields.
		
		itemNode.querySelectorAll('.field').forEach(function (input)
		{
			input.value = item[input.name];
			
			input.addEventListener('change', function ()
			{
				item[input.name] = input.value;
				save();
			});
		});
		
		// File upload fields. Currently only used for the icon.
		
		itemNode.querySelectorAll('.file-selector').forEach(function (div)
		{
			var input = div.querySelector('input[type=file]');
			var iconPreview = input.name == 'icons' ? itemNode.querySelector('.icon-preview') : undefined;
			
			var setFile = function (data)
			{
				item[input.name] = data;
				updatePreview();
				save();
			};
			
			var updatePreview = function ()
			{
				if (iconPreview !== undefined)
				{
					iconPreview.innerHTML = '';
					
					var icon;
					
					if (typeof item.icons == 'object')
					{
						if (item.icons !== null)
						{
							var bestSize;
							
							Object.getOwnPropertyNames(item.icons).forEach(function (property)
							{
								if (/^[1-9]\d*$/.test(property))
								{
									var size = +property;
									
									if (icon !== undefined)
									{
										if (size < 16 || bestSize < 16)
										{
											if (size <= bestSize)
											{
												return;
											}
										}
										else if (size >= bestSize)
										{
											return;
										}
									}
									
									icon = item.icons[property];
									bestSize = size;
								}
							});
						}
					}
					else
					{
						icon = item.icons;
					}
					
					if (icon === undefined)
					{
						return;
					}
					
					var img = document.createElement('img');
					img.alt = 'Icon';
					img.src = icon;
					iconPreview.appendChild(img);
				}
			};
			
			updatePreview();
			
			input.addEventListener('change', function ()
			{
				var file = input.files[0];
				
				if (file === undefined)
				{
					setFile(null);
					return;
				}
				
				var reader = new FileReader();
				
				reader.addEventListener('load', function ()
				{
					setFile(reader.result);
				});
				
				reader.readAsDataURL(file);
			});
			
			if (iconPreview !== undefined)
			{
				iconPreview.addEventListener('click', function ()
				{
					input.click();
				});
			}
			
			div.querySelectorAll('.file-browse-button').forEach(function (button)
			{
				button.addEventListener('click', function ()
				{
					input.click();
				});
			});
			
			div.querySelectorAll('.file-remove-button').forEach(function (button)
			{
				button.addEventListener('click', function ()
				{
					setFile(null);
				});
			});
		});
		
		// Apply syntax checking and line number logic/events to the code field.
		
		itemNode.querySelectorAll('.code-container').forEach(function (container)
		{
			var timer = null;
			var statusNode = container.querySelector('.status');
			var input = container.querySelector('textarea.code');
			var lineNumbersNode = container.querySelector('.line-numbers > span');
			var numDisplayedLines = 0;
			var lastError = null;
			
			var validateSyntax = function ()
			{
				if (timer !== null)
				{
					window.clearTimeout(timer);
					timer = null;
				}
				
				if (statusNode.classList.contains('disabled'))
				{
					lastError = null;
					return;
				}
				
				timer = window.setTimeout(function ()
				{
					timer = null;
					
					// The user might have disabled syntax checking since
					// the timer was created. Double-check the setting.
					
					if (statusNode.classList.contains('disabled'))
					{
						lastError = null;
						return;
					}
					
					// Syntax checking is enabled. Check the JavaScript syntax of the user's input.
					
					var error = false;
					
					try
					{
						// Create an anonymous function using the input as the body.
						// This allows us to check that the syntax is valid without
						// actually running the code.
						
						new Function(input.value);
					}
					catch (e)
					{
						if (e instanceof Error)
						{
							error = e.constructor.name+': '+e.message;
							
							if (e.lineNumber !== undefined && e.columnNumber !== undefined)
							{
								error += ' ('+(e.lineNumber - 2)+':'+(e.columnNumber + 1)+')';
							}
						}
						else
						{
							error = 'Unexpected value thrown during validation';
						}
					}
					
					if (error !== lastError)
					{
						lastError = error;
						statusNode.classList.toggle('status-error', error !== false);
						statusNode.classList.toggle('status-valid', error === false);
						statusNode.title = error === false ? 'Syntax OK' : error;
					}
				}, 100);
			};
			
			var updateLineNumbers = function ()
			{
				var newlineMatches = input.value.match(/\r?\n/g);
				var numLines = newlineMatches === null ? 1 : newlineMatches.length + 1;
				
				while (numLines > numDisplayedLines)
				{
					lineNumbersNode.appendChild(document.createElement('span'));
					++numDisplayedLines;
				}
				
				while (numLines < numDisplayedLines)
				{
					lineNumbersNode.removeChild(lineNumbersNode.lastChild);
					--numDisplayedLines;
				}
			};
			
			if (!prefs.validate)
			{
				// Syntax checking is disabled.
				
				statusNode.classList.add('disabled');
			}
			
			if (prefs.lineNumbers)
			{
				container.querySelector('.code-editor').classList.add('with-line-numbers');
			}
			
			input.addEventListener('input', validateSyntax);
			input.addEventListener('focus', validateSyntax);
			input.addEventListener('input', updateLineNumbers);
			
			input.addEventListener('scroll', function ()
			{
				lineNumbersNode.style.top = -input.scrollTop+'px';
			});
			
			updateLineNumbers();
		});
		
		// Set up labels and focus style helpers to checkboxes and radios.
		
		itemNode.querySelectorAll('.checkables input[type=checkbox], .checkables input[type=radio]').forEach(function (input)
		{
			++itemNonce;
			input.id = 'field-'+item.id+'-'+itemNonce;
			var parentNode = input.parentNode;
			
			input.addEventListener('focus', function ()
			{
				parentNode.classList.add('focused');
			});
			
			input.addEventListener('blur', function ()
			{
				parentNode.classList.remove('focused');
			});
			
			parentNode.querySelectorAll('label').forEach(function (label)
			{
				label.htmlFor = input.id;
			});
		});
		
		// Set up default selections and save events for context checkboxes.
		
		itemNode.querySelectorAll('.context').forEach(function (input)
		{
			input.checked = (item.contexts.indexOf(input.value) != -1);
			
			input.addEventListener('click', function ()
			{
				var index = item.contexts.indexOf(input.value);
				
				if (input.checked)
				{
					if (index == -1)
					{
						item.contexts.push(input.value);	
					}
				}
				else
				{
					if (index != -1)
					{
						item.contexts.splice(index, 1);
					}
				}
				
				save();
			});
		});
		
		itemNode.querySelectorAll('.renderer').forEach(function (div)
		{
			if (item.extensionId == null)
			{
				item.extensionId = browser.runtime.id;
			}
			
			if (extraExtensions.length == 0 && item.extensionId === browser.runtime.id)
			{
				div.parentNode.removeChild(div);
				return;
			}
			
			div.querySelectorAll('select').forEach(function (select)
			{
				var selectionExists = false;
				
				select.addEventListener('focus', function ()
				{
					select.classList.add('focused');
				});
				
				select.addEventListener('blur', function ()
				{
					select.classList.remove('focused');
				});
				
				select.addEventListener('change', function ()
				{
					item.extensionId = select.value;
					item.extensionName = select.selectedOptions[0].textContent;
					save();
				});
				
				select.querySelectorAll('option').forEach(function (option)
				{
					option.value = browser.runtime.id;
					
					if (item.extensionId === browser.runtime.id)
					{
						option.selected = true;
						selectionExists = true;
					}
				});
				
				extraExtensions.forEach(function (extensionInfo)
				{
					var option = document.createElement('option');
					option.value = extensionInfo.id;
					option.textContent = extensionInfo.name;
					
					if (item.extensionId === extensionInfo.id)
					{
						option.selected = true;
						selectionExists = true;
					}
					
					select.appendChild(option);
				});
				
				if (!selectionExists)
				{
					var option = document.createElement('option');
					option.value = item.extensionId;
					option.textContent = item.extensionName+' (Inactive)';
					option.selected = true;
					select.appendChild(option);
				}
			});
		});
		
		// Set up default selections and save events for scope radios.
		
		itemNode.querySelectorAll('.scope').forEach(function (input)
		{
			input.checked = (item.scope == input.value || (item.scope === undefined && input.value == 'background'));
			
			input.addEventListener('click', function ()
			{
				item.scope = input.value;
				save();
			});
		});
		
		// Set up the Delete button.
		
		itemNode.querySelectorAll('.delete-button').forEach(function (button)
		{
			button.addEventListener('click', function ()
			{
				var hasData = (item.title != '' || item.code != '' || item.patterns != '' || item.contexts.length > 0);
				var description;
				
				switch (item.type)
				{
				case 'separator':
					description = 'separator';
					break;
				
				default:
					description = 'item "'+item.title+'"';
				}
				
				if (!hasData || window.confirm('This will permanently delete the '+description+'.'))
				{
					var index = prefs.items.indexOf(item);
					
					if (index != -1)
					{
						prefs.items.splice(index, 1);
					}
					
					save();
					itemNode.classList.add('to-delete');
					animateFadeOut(itemNode, function ()
					{
						itemNode.parentNode.removeChild(itemNode);
					});
				}
			});
		});
		
		// Set up the Export button.
		
		itemNode.querySelectorAll('.export-button').forEach(function (button)
		{
			button.addEventListener('click', function ()
			{
				var exportItem =
				{
					code: item.code,
					contexts: item.contexts,
					icons: item.icons,
					patterns: item.patterns,
					scope: item.scope,
					title: item.title,
					type: item.type,
				};
				
				// Create a reasonable filename with no special characters.
				
				var letters = 'abcdefghijklmnopqrstuvwxyz';
				var collator = new Intl.Collator('en-US', {caseFirst: 'lower', sensitivity: 'case'});
				var filename = item.title
					.replace(/&?%s|&[\S\s]/g, function (match)
					{
						if (match.substring(match.length - 2) == '%s')
						{
							return '-selection-';
						}
						
						return match.substring(1);
					})
					.replace(/['\u2019]/g, '')
					.toLowerCase()
					.replace(/[^a-z0-9]/g, function (match)
					{
						// Transliterate to ASCII the best we can in vanilla JS.
						
						if (collator.compare(match, 'a') >= 0 && collator.compare(match, 'Z') < 0)
						{
							for (var i = letters.length - 1; i >= 0; --i)
							{
								if (collator.compare(match, letters.charAt(i)) >= 0)
								{
									return letters.charAt(i);
								}
							}
						}
						
						return '-';
					})
					.replace(/-+/g, '-')
					.replace(/^-+|-+$/g, '');
				
				if (filename == '')
					{
					filename = item.id;
					}
				
				filename += '.contextlet.json';
				
				var link = document.createElement('a');
				link.href = 'data:application/json,'+encodeURIComponent(JSON.stringify(exportItem));
				link.download = filename;
				link.hidden = true;
				link.style.display = 'none';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
			});
		});
		
		// Set up the Move Up button.
		
		itemNode.querySelectorAll('.move-up-button').forEach(function (button)
		{
			button.addEventListener('click', function ()
			{
				var index = prefs.items.indexOf(item);
				
				if (index > 0)
				{
					var prevItemNode = itemNode.previousSibling;
					
					while (prevItemNode.classList.contains('to-delete'))
					{
						prevItemNode = prevItemNode.previousSibling;
					}
					
					var oldTop = itemNode.offsetTop;
					var prevOldTop = prevItemNode.offsetTop;
					
					itemNode.parentNode.removeChild(itemNode);
					prevItemNode.parentNode.insertBefore(itemNode, prevItemNode);
					
					itemNode.classList.add('moved')
					itemNode.style.top = '0';
					var newTop = itemNode.offsetTop;
					itemNode.style.top = (oldTop - newTop)+'px';
					
					prevItemNode.classList.add('moved')
					prevItemNode.style.top = '0';
					var prevNewTop = prevItemNode.offsetTop;
					prevItemNode.style.top = (prevOldTop - prevNewTop)+'px';
					
					prefs.items.splice(index, 1);
					prefs.items.splice(index - 1, 0, item);
					save();
					
					window.setTimeout(function ()
					{
						itemNode.classList.remove('moved');
						itemNode.style.top = null;
						prevItemNode.classList.remove('moved');
						prevItemNode.style.top = null;
					}, 0);
				}
			});
		});
		
		// Set up the Move Down button.
		
		itemNode.querySelectorAll('.move-down-button').forEach(function (button)
		{
			button.addEventListener('click', function ()
			{
				var index = prefs.items.indexOf(item);
				
				if (index != -1 && index < prefs.items.length - 1)
				{
					var nextItemNode = itemNode.nextSibling;
					
					while (nextItemNode.classList.contains('to-delete'))
					{
						nextItemNode = nextItemNode.nextSibling;
					}
					
					var oldTop = itemNode.offsetTop;
					var nextOldTop = nextItemNode.offsetTop;
					
					itemNode.parentNode.removeChild(nextItemNode);
					itemNode.parentNode.insertBefore(nextItemNode, itemNode);
					
					itemNode.classList.add('moved')
					itemNode.style.top = '0';
					var newTop = itemNode.offsetTop;
					itemNode.style.top = (oldTop - newTop)+'px';
					
					nextItemNode.classList.add('moved')
					nextItemNode.style.top = '0';
					var nextNewTop = nextItemNode.offsetTop;
					nextItemNode.style.top = (nextOldTop - nextNewTop)+'px';
					
					prefs.items.splice(index, 1);
					prefs.items.splice(index + 1, 0, item);
					save();
					
					window.setTimeout(function ()
					{
						itemNode.classList.remove('moved');
						itemNode.style.top = null;
						nextItemNode.classList.remove('moved');
						nextItemNode.style.top = null;
					}, 0);
				}
			});
		});
		
		return itemNode;
	};
	
	/**
	 * Output a line to the import results.
	 */
	var addImportResult = function (message, isError)
	{
		var p = document.createElement('p');
		
		if (isError === true)
		{
			p.className = 'error';
		}
		
		p.textContent = message;
		importResultNode.appendChild(p);
	};
	
	/**
	 * Asychronously save all changes to the prefs.
	 */
	var save = function ()
	{
		browser.storage.local.set(prefs);
	};
	
	var templateNode = document.querySelector('#item-template .item');
	var importResultNode = document.querySelector('#import-result');
	var itemListNode = document.querySelector('#items');
	var lastId = -1;
	var extraExtensions = [];
	var supportedContextSet = new Set();
	var supportedScopeSet = new Set();
	
	extensionInfos.forEach(function (extensionInfo)
	{
		if (/^extra contextlet/i.test(extensionInfo.name))
		{
			extraExtensions.push(extensionInfo);
		}
	});
	
	extraExtensions.sort(function (a, b)
	{
		return a.name.replace(/\D+/g) - b.name.replace(/\D+/g);
	});
	
	// Gather the set of supported contexts.
	
	templateNode.querySelectorAll('.context-container input.context').forEach(function (input)
	{
		supportedContextSet.add(input.value);
	});
	
	// Gather the set of supported scopes.
	
	templateNode.querySelectorAll('.scope-container input.scope').forEach(function (input)
	{
		supportedScopeSet.add(input.value);
	});
	
	// Set up the UI for the global options.
	
	document.querySelectorAll('.main-options input[type=checkbox]').forEach(function (input)
	{
		input.checked = prefs[input.name];
		var parentNode = input.parentNode;
		
		input.addEventListener('focus', function ()
		{
			parentNode.classList.add('focused');
		});
		
		input.addEventListener('blur', function ()
		{
			parentNode.classList.remove('focused');
		});
		
		input.addEventListener('click', function ()
		{
			prefs[input.name] = input.checked;
			
			switch (input.name)
			{
			case 'lineNumbers':
				document.querySelectorAll('.code-editor').forEach(function (node)
				{
					node.classList.toggle('with-line-numbers', input.checked);
				});
				
				break;
			
			case 'validate':
				document.querySelectorAll('.code-container .status').forEach(function (statusNode)
				{
					if (input.checked)
					{
						// Enable syntax checking.
						
						statusNode.classList.remove('disabled');
					}
					else
					{
						// Disable syntax checking.
						
						statusNode.classList.add('disabled');
						statusNode.classList.remove('status-error');
						statusNode.classList.remove('status-valid');
						statusNode.title = null;
					}
				});
				
				break;
			}
			
			save();
		});
	});
	
	// Create the configuration UI for the existing menu items.
	
	prefs.items.forEach(function (item, index)
	{
		// Make sure we're always generating ids with higher
		// numbers than any existing format-clashing ids.
		
		if (/^[1-9]\d*|0$/.test(item.id) && item.id > lastId)
		{
			lastId = +item.id;
		}
		
		var itemNode = createItemNode(item);
		itemListNode.appendChild(itemNode);
	});
	
	document.querySelectorAll('.add-item-button').forEach(function (button)
	{
		button.addEventListener('click', function ()
		{
			createItem({type: 'normal'});
		});
	});
	
	document.querySelectorAll('.add-separator-button').forEach(function (button)
	{
		button.addEventListener('click', function ()
		{
			createItem({type: 'separator'});
		});
	});
	
	document.querySelectorAll('.import-button').forEach(function (button)
	{
		button.addEventListener('click', function ()
		{
			importResultNode.textContent = '';
			var numErrors = 0;
			var numSuccess = 0;
			
			var addError = function (message)
			{
				++numErrors;
				addImportResult(message, true);
			};
			
			var input = document.createElement('input');
			input.type = 'file';
			input.hidden = true;
			input.multiple = true;
			input.style.display = 'none';
			
			input.addEventListener('change', function ()
			{
				if (input.files.length == 0)
				{
					return;
				}
				
				var fileIndex = -1;
				
				var processNextFile = function ()
				{
					++fileIndex;
					
					if (fileIndex >= input.files.length)
					{
						// Import is complete.
						
						var result = [];
						
						if (numSuccess > 0)
						{
							result.push(numSuccess+' item'+(numSuccess == 1 ? '' : 's')+' successfully imported.');
						}
						
						if (numErrors > 0)
						{
							result.push(numErrors+' error'+(numErrors == 1 ? '' : 's')+' occurred during import.');
						}
						
						if (result.length == 0)
						{
							result.push('No items found to import.');
						}
						
						addImportResult(result.join(' '));
						return;
					}
					
					var file = input.files[fileIndex];
					var reader = new FileReader();
					
					reader.addEventListener('load', function ()
					{
						var isArray;
						var itemIndex;
						
						try
						{
							var items = JSON.parse(reader.result);
							var importItems = [];
							isArray = (items instanceof Array);
							
							if (!isArray)
							{
								items = [items];
							}
							
							items.forEach(function (item, index)
							{
								if (isArray)
								{
									itemIndex = index;
								}
								
								// Validate the import item.
								
								var requiredProperties =
								[
									'code',
									'contexts',
									'scope',
									'title',
									'type',
								];
								
								requiredProperties.forEach(function (property)
								{
									if (!Object.prototype.hasOwnProperty.call(item, property))
									{
										throw new Error('Missing required property "'+property+'"');
									}
								});
								
								if (typeof item.code != 'string')
								{
									throw new Error('"code" must be a string; '+(typeof item.code)+' given');
								}
								
								if (!(item.contexts instanceof Array))
								{
									throw new Error('"contexts" must be an Array; '+(typeof item.contexts)+' given');
								}
								
								item.contexts.forEach(function (context)
								{
									if (typeof context != 'string')
									{
										throw new Error('Context values must be strings; '+(typeof context)+' given');
									}
									
									if (!supportedContextSet.has(context))
									{
										throw new Error('Context value "'+context+'" is not supported');
									}
								});
								
								if (typeof item.scope != 'string')
								{
									throw new Error('"scope" must be a string; '+(typeof item.scope)+' given');
								}
								
								if (!supportedScopeSet.has(item.scope))
								{
									throw new Error('Scope value "'+item.scope+'" is not supported');
								}
								
								if (typeof item.title != 'string')
								{
									throw new Error('"title" must be a string; '+(typeof item.title)+' given');
								}
								
								if (item.type !== 'normal' && item.type !== 'separator')
								{
									throw new Error('"type" must be either "normal" or "separator"');
								}
								
								var importItem =
								{
									code: item.code,
									contexts: item.contexts,
									scope: item.scope,
									title: item.title,
									type: item.type,
								};
								
								if (Object.prototype.hasOwnProperty.call(item, 'icons'))
								{
									if (typeof item.icons == 'object')
									{
										if (item.icons !== null)
										{
											Object.getOwnPropertyNames(item.icons).forEach(function (property)
											{
												if (!/^[1-9]\d*$/.test(property))
												{
													throw new Error('Invalid icon size "'+property+'"');
												}
												
												if (typeof item.icons[property] != 'string')
												{
													throw new Error('Icon value for size "'+property+'" must be a string; '+(typeof item.icons[property])+' given');
												}
												
												if (item.icons[property].substring(0, 5) != 'data:')
												{
													throw new Error('Icon value for size "'+property+'" must be a data URI');
												}
											});
										}
									}
									else if (typeof item.icons == 'string')
									{
										if (item.icons.substring(0, 5) != 'data:')
										{
											throw new Error('Icon string must be a data URI');
										}
									}
									else
									{
										throw new Error('When present, "icons" must be a string, object, or null; '+(typeof item.icons)+' given');
									}
									
									importItem.icons = item.icons;
								}
								
								if (Object.prototype.hasOwnProperty.call(item, 'patterns'))
								{
									if (typeof item.patterns != 'string')
									{
										throw new Error('When present, "patterns" must be a string; '+(typeof item.patterns)+' given');
									}
									
									importItem.patterns = item.patterns;
								}
								
								importItems.push(importItem);
							});
							
							importItems.forEach(function (importItem)
							{
								createItem(importItem);
								++numSuccess;
							});
						}
						catch (error)
						{
							if (error instanceof SyntaxError)
							{
								addError('File "'+file.name+'" is not a valid JSON file.');
							}
							else
							{
								var context = error.constructor.name;
								
								if (itemIndex !== undefined)
								{
									context = ' in item index '+itemIndex;
								}
								
								addError('File "'+file.name+'" is not a valid contextlet file ('+context+': '+error.message+').');
							}
						}
						
						window.setTimeout(processNextFile, 0);
					});
					
					reader.readAsText(file);
				}
				
				processNextFile();
			});
			
			document.body.appendChild(input);
			input.click();
			document.body.removeChild(input);
		});
	});
});
