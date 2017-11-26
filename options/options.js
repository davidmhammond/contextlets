'use strict';

var prefDefaults =
{
	items: [],
	lineNumbers: false,
	validate: true,
};

browser.storage.local.get(prefDefaults).then(function (prefs)
{
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
		}, 0);
	};
	
	/**
	 * Add a new menu item and its configuration UI.
	 */
	var createItem = function (type)
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
			type: type,
		};
		
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
					
					if (typeof item.icons != 'string')
					{
						return;
					}
					
					var img = document.createElement('img');
					img.alt = 'Icon';
					img.src = item.icons;
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
	 * Asychronously save all changes to the prefs.
	 */
	var save = function ()
	{
		browser.storage.local.set(prefs);
	};
	
	var templateNode = document.querySelector('#item-template .item');
	var itemListNode = document.querySelector('#items');
	var lastId = -1;
	
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
			createItem('normal');
		});
	});
	
	document.querySelectorAll('.add-separator-button').forEach(function (button)
	{
		button.addEventListener('click', function ()
		{
			createItem('separator');
		});
	});
});
