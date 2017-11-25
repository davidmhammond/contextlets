'use strict';

var prefDefaults =
{
	items: [],
	validate: true,
};

browser.storage.local.get(prefDefaults).then(function (prefs)
{
	var templateNode = document.getElementById('item-template').getElementsByClassName('item')[0];
	var itemListNode = document.getElementById('items');
	var lastId = -1;
	
	var animateFadeIn = function (node)
	{
		var height = node.offsetHeight;
		node.classList.add('new');
		
		window.setTimeout(function ()
		{
			node.classList.remove('new');
			node.style.height = height+'px';
			
			window.setTimeout(function ()
			{
				node.style.height = null;
			}, 500);
		}, 0);
	};
	
	var createItem = function (type)
	{
		++lastId;
		prefs.items[lastId] =
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
		
		var itemNode = createItemNode(prefs.items[lastId]);
		itemListNode.appendChild(itemNode);
		animateFadeIn(itemNode);
		save();
	};
	
	var createItemNode = function (item)
	{
		var itemNode = templateNode.cloneNode(true);
		itemNode.getElementsByClassName('item-content')[0].dataset.itemId = item.id;
		itemNode.classList.add('type-'+item.type);
		var itemNonce = -1;
		var removeSelectors = [];
		
		switch (item.type)
		{
		case 'separator':
			removeSelectors.push('.title-container', '.code-container', '.scope-container');
			itemNode.getElementsByClassName('delete-button')[0].textContent = 'Delete Separator';
			break;
		}
		
		if (item.type != 'separator')
		{
			removeSelectors.push('.separator-title-container');
		}
		
		if (removeSelectors.length > 0)
		{
			Array.prototype.forEach.call(itemNode.querySelectorAll(removeSelectors.join(', ')), function (node)
			{
				node.parentNode.removeChild(node);
			});
		}
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('field'), function (input)
		{
			input.value = item[input.name];
			
			input.addEventListener('change', function ()
			{
				item[input.name] = input.value;
				save();
			});
		});
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('file-selector'), function (div)
		{
			var input = div.querySelector('input[type=file]');
			var iconPreview = input.name == 'icons' ? itemNode.getElementsByClassName('icon-preview')[0] : undefined;
			
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
			
			Array.prototype.forEach.call(div.getElementsByClassName('file-browse-button'), function (button)
			{
				button.addEventListener('click', function ()
				{
					input.click();
				});
			});
			
			Array.prototype.forEach.call(div.getElementsByClassName('file-remove-button'), function (button)
			{
				button.addEventListener('click', function ()
				{
					setFile(null);
				});
			});
		});
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('code-container'), function (container)
		{
			var timer = null;
			var statusNode = container.getElementsByClassName('status')[0];
			var input = container.getElementsByClassName('code')[0];
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
					
					if (statusNode.classList.contains('disabled'))
					{
						lastError = null;
						return;
					}
					
					var error = false;
					
					try
					{
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
			
			if (!prefs.validate)
			{
				statusNode.classList.add('disabled');
			}
			
			input.addEventListener('input', validateSyntax);
			input.addEventListener('focus', validateSyntax);
		});
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('checkables'), function (container)
		{
			Array.prototype.forEach.call(container.getElementsByTagName('input'), function (input)
			{
				if (input.type != 'checkbox' && input.type != 'radio')
				{
					return;
				}
				
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
				
				Array.prototype.forEach.call(parentNode.getElementsByTagName('label'), function (label)
				{
					label.htmlFor = input.id;
				});
			});
		});
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('context'), function (input)
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
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('scope'), function (input)
		{
			++itemNonce;
			input.id = 'field-'+item.id+'-'+itemNonce;
			input.checked = (item.scope == input.value || (item.scope === undefined && input.value == 'background'));
			
			input.addEventListener('click', function ()
			{
				item.scope = input.value;
				save();
			});
			
			Array.prototype.forEach.call(input.parentNode.getElementsByTagName('label'), function (label)
			{
				label.htmlFor = input.id;
			});
		});
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('delete-button'), function (button)
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
					itemNode.style.height = itemNode.offsetHeight+'px';
					
					window.setTimeout(function ()
					{
						itemNode.classList.add('deleted');
						itemNode.style.height = null;
						
						window.setTimeout(function ()
						{
							itemNode.parentNode.removeChild(itemNode);
						}, 500);
					}, 0);
				}
			});
		});
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('move-up-button'), function (button)
		{
			button.addEventListener('click', function ()
			{
				var index = prefs.items.indexOf(item);
				
				if (index > 0)
				{
					var prevItemNode = itemNode.previousSibling;
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
		
		Array.prototype.forEach.call(itemNode.getElementsByClassName('move-down-button'), function (button)
		{
			button.addEventListener('click', function ()
			{
				var index = prefs.items.indexOf(item);
				
				if (index != -1 && index < prefs.items.length - 1)
				{
					var nextItemNode = itemNode.nextSibling;
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
	
	var save = function ()
	{
		browser.storage.local.set(prefs);
	};
	
	Array.prototype.forEach.call(document.getElementsByClassName('main-options'), function (container)
	{
		Array.prototype.forEach.call(container.getElementsByTagName('input'), function (input)
		{
			if (input.type != 'checkbox')
			{
				return;
			}
			
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
				case 'validate':
					Array.prototype.forEach.call(document.querySelectorAll('.code-container .status'), function (statusNode)
					{
						if (input.checked)
						{
							statusNode.classList.remove('disabled');
						}
						else
						{
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
	});
	
	prefs.items.forEach(function (item, index)
	{
		if (/^[1-9]\d*|0$/.test(item.id) && item.id > lastId)
		{
			lastId = +item.id;
		}
		
		var itemNode = createItemNode(item);
		itemListNode.appendChild(itemNode);
	});
	
	Array.prototype.forEach.call(document.getElementsByClassName('add-item-button'), function (button)
	{
		button.addEventListener('click', function ()
		{
			createItem('normal');
		});
	});
	
	Array.prototype.forEach.call(document.getElementsByClassName('add-separator-button'), function (button)
	{
		button.addEventListener('click', function ()
		{
			createItem('separator');
		});
	});
});
