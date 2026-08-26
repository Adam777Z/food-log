const db = new Dexie('FoodLogDB');

db.version(2).stores({
	days: '++id, date, notes, created_at',
	meals: '++id, day_id, date'
});

// Application State
let search_active = false;
let current_editing_day_date = null;

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
	setup_event_listeners();
	load_and_display_days();
});

// Event Listeners Setup
function setup_event_listeners() {
	// Add Day Button
	document.getElementById('add_day_btn').addEventListener('click', open_add_day_modal);

	// Backup, Restore and Erase
	document.getElementById('backup_btn').addEventListener('click', backup_data);
	document.getElementById('restore_btn').addEventListener('click', () => {
		document.getElementById('restore_file').click();
	});
	document.getElementById('restore_file').addEventListener('change', restore_data);
	document.getElementById('erase_btn').addEventListener('click', erase_all_data);

	// Add Day Modal
	document.getElementById('save_day_btn').addEventListener('click', save_new_day);
	document.getElementById('add_day_date').addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			save_new_day();
		}
	});
	document.getElementById('add_day_form').addEventListener('submit', (e) => {
		e.preventDefault();
		save_new_day();
	});

	// Edit Day Modal
	document.getElementById('save_edit_day_btn').addEventListener('click', save_edit_day_date);
	document.getElementById('edit_day_date').addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			save_edit_day_date();
		}
	});
	document.getElementById('edit_day_form').addEventListener('submit', (e) => {
		e.preventDefault();
		save_edit_day_date();
	});

	// Auto focus inputs on modal show
	document.getElementById('add_day_modal').addEventListener('shown.bs.modal', () => {
		document.getElementById('add_day_date').focus();
	});
	document.getElementById('edit_day_modal').addEventListener('shown.bs.modal', () => {
		document.getElementById('edit_day_date').focus();
	});

	// Search
	document.getElementById('search_btn').addEventListener('click', perform_search);
	document.getElementById('clear_search_btn').addEventListener('click', clear_search);
	document.getElementById('search_date').addEventListener('keypress', (e) => {
		if (e.key === 'Enter') perform_search();
	});
	document.getElementById('search_meal_name').addEventListener('keypress', (e) => {
		if (e.key === 'Enter') perform_search();
	});
	document.getElementById('search_calories').addEventListener('keypress', (e) => {
		if (e.key === 'Enter') perform_search();
	});
	document.getElementById('search_notes').addEventListener('keypress', (e) => {
		if (e.key === 'Enter') perform_search();
	});
}

// Backup Data to JSON File
async function backup_data() {
	try {
		// Fetch all data from database
		const days = await db.days.toArray();
		const meals = await db.meals.toArray();

		const backup = {
			version: 1,
			exported_at: new Date().toISOString(),
			days: days,
			meals: meals
		};

		// Create a blob and download
		const json_string = JSON.stringify(backup, null, 2);
		const blob = new Blob([json_string], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = 'food-log-backup.json';
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
		URL.revokeObjectURL(url);

		// alert('Data backed up successfully!');
	} catch (error) {
		console.error('Backup error:', error);
		alert('Error backing up data: ' + error.message);
	}
}

// Restore Data from JSON File
async function restore_data(event) {
	try {
		const file = event.target.files[0];
		if (!file) return;

		const file_content = await file.text();
		const backup = JSON.parse(file_content);

		// Validate backup format
		if (!backup.version || !backup.days || !backup.meals || !Array.isArray(backup.days) || !Array.isArray(backup.meals)) {
			alert('Invalid backup file format');
			return;
		}

		// Confirm restore
		const confirm_restore = confirm('This will replace all your current data. Are you sure you want to restore from this backup?');
		if (!confirm_restore) {
			event.target.value = '';
			return;
		}

		// Clear existing data
		await db.days.clear();
		await db.meals.clear();

		// Restore days
		for (const day of backup.days) {
			await db.days.add(day);
		}

		// Restore meals
		for (const meal of backup.meals) {
			await db.meals.add(meal);
		}

		load_and_display_days();
		alert('Data restored successfully!');
		event.target.value = '';
	} catch (error) {
		console.error('Restore error:', error);
		alert('Error restoring data: ' + error.message);
		event.target.value = '';
	}
}

// Erase All Data
async function erase_all_data() {
	try {
		const days_count = await db.days.count();
		const meals_count = await db.meals.count();

		if (days_count === 0 && meals_count === 0) {
			alert('There is no data to erase.');
			return;
		}

		const confirm_erase = confirm('Are you sure you want to erase ALL data? This will permanently delete all logged days and meals.\n\nThis action cannot be undone!');

		if (!confirm_erase) return;

		await db.days.clear();
		await db.meals.clear();

		if (search_active) {
			clear_search();
		} else {
			load_and_display_days();
		}

		alert('All data has been erased successfully!');
	} catch (error) {
		console.error('Erase error:', error);
		alert('Error erasing data: ' + error.message);
	}
}



// Open Add Day Modal
function open_add_day_modal() {
	const today = new Date().toISOString().split('T')[0];
	document.getElementById('add_day_date').value = today;
	const modal = new bootstrap.Modal(document.getElementById('add_day_modal'));
	modal.show();
}

// Save New Day
async function save_new_day() {
	const date_string = document.getElementById('add_day_date').value;

	if (!date_string) {
		alert('Please select a date');
		return;
	}

	// Check if day already exists
	const existing_day = await db.days.where('date').equals(date_string).first();
	if (existing_day) {
		alert('Entry already exists for this date');
		return;
	}

	await db.days.add({
		date: date_string,
		notes: '',
		created_at: new Date().toISOString()
	});

	bootstrap.Modal.getInstance(document.getElementById('add_day_modal')).hide();
	load_and_display_days();
}

// Open Edit Day Date Modal
function open_edit_day_modal(day_id, current_date) {
	current_editing_day_date = current_date;
	document.getElementById('edit_day_date').value = current_date;
	const modal = new bootstrap.Modal(document.getElementById('edit_day_modal'));

	// Store day_id as data attribute
	document.getElementById('edit_day_modal').dataset.dayId = day_id;

	modal.show();
}

// Save Edited Day Date
async function save_edit_day_date() {
	const day_id = parseInt(document.getElementById('edit_day_modal').dataset.dayId);
	const new_date = document.getElementById('edit_day_date').value;

	if (!new_date) {
		alert('Please select a date');
		return;
	}

	// Check if new date already exists for another day
	const existing_day = await db.days.where('date').equals(new_date).first();
	if (existing_day && existing_day.id !== day_id) {
		alert('A food log for this date already exists!');
		return;
	}

	// Update the day
	await db.days.update(day_id, { date: new_date });

	// Update all meals for this day
	await db.meals.where('day_id').equals(day_id).modify({ date: new_date });

	bootstrap.Modal.getInstance(document.getElementById('edit_day_modal')).hide();
	load_and_display_days();
}

// Build inline meal form HTML
function build_inline_meal_form_html(day_id, meal_id, meal_or_data) {
	const is_edit = !!meal_id;
	const title = is_edit ? 'Edit Meal' : 'Add Meal';
	const name_val = meal_or_data ? escape_html(meal_or_data.name || '') : '';
	const calories_val = meal_or_data && meal_or_data.calories !== undefined && meal_or_data.calories !== '' ? meal_or_data.calories : '';
	const notes_val = meal_or_data ? escape_html(meal_or_data.notes || '') : '';

	const time_options = [
		{ value: '', label: 'Select time' },
		{ value: 'overnight', label: 'Overnight' },
		{ value: 'morning', label: 'Morning' },
		{ value: 'beforeNoon', label: 'Before Noon' },
		{ value: 'afternoon', label: 'Afternoon' },
		{ value: 'evening', label: 'Evening' },
		{ value: 'night', label: 'Night' },
		{ value: 'custom', label: 'Custom' }
	];

	let selected_time = '';
	let custom_time_val = '';
	let custom_time_display = 'none';

	if (meal_or_data) {
		if (meal_or_data.time_select !== undefined) {
			selected_time = meal_or_data.time_select;
			custom_time_val = escape_html(meal_or_data.custom_time || '');
			custom_time_display = selected_time === 'custom' ? 'block' : 'none';
		} else if (meal_or_data.time_of_day) {
			if (['overnight', 'morning', 'beforeNoon', 'afternoon', 'evening', 'night'].includes(meal_or_data.time_of_day)) {
				selected_time = meal_or_data.time_of_day;
			} else {
				selected_time = 'custom';
				custom_time_val = escape_html(meal_or_data.time_of_day);
				custom_time_display = 'block';
			}
		}
	}

	const options_html = time_options.map(opt =>
		`<option value="${opt.value}"${opt.value === selected_time ? ' selected' : ''}>${opt.label}</option>`
	).join('');

	return `
		<div class="inline-meal-form" data-day-id="${day_id}" data-meal-id="${meal_id || ''}">
			<div class="inline-meal-form-header">
				<h6><i class="bi bi-${is_edit ? 'pencil' : 'plus-circle'}"></i> ${title}</h6>
			</div>
			<div class="inline-meal-form-body">
				<div class="mb-2">
					<label class="form-label form-label-sm">Meal Name</label>
					<input type="text" class="form-control form-control-sm inline-meal-name" value="${name_val}" placeholder="for example: drink 300 ml, soup 300 g, salt 1 g, water 300 ml" required>
				</div>
				<div class="mb-2">
					<label class="form-label form-label-sm">Time of Day</label>
					<select class="form-select form-select-sm inline-meal-time" required>
						${options_html}
					</select>
					<input type="text" class="form-control form-control-sm mt-1 inline-meal-time-custom" placeholder="Enter custom time" value="${custom_time_val}" style="display:${custom_time_display};">
				</div>
				<div class="mb-2">
					<label class="form-label form-label-sm">Calories (kcal)</label>
					<input type="number" class="form-control form-control-sm inline-meal-calories" min="0" step="0.1" value="${calories_val}" required>
				</div>
				<div class="mb-2">
					<label class="form-label form-label-sm">Notes</label>
					<textarea class="form-control form-control-sm inline-meal-notes" rows="2">${notes_val}</textarea>
				</div>
			</div>
			<div class="inline-meal-form-actions">
				<button type="button" class="btn btn-sm btn-secondary inline-meal-cancel-btn">Cancel</button>
				<button type="button" class="btn btn-sm btn-primary inline-meal-save-btn">Save Meal</button>
			</div>
		</div>
	`;
}

// Collect current states of open inline meal forms
function get_open_meal_forms_state(exclude_form = null) {
	const forms = document.querySelectorAll('.inline-meal-form');
	const states = [];
	forms.forEach(form => {
		if (form === exclude_form) return;
		const day_id = parseInt(form.dataset.dayId);
		const meal_id_str = form.dataset.mealId;
		const meal_id = meal_id_str ? parseInt(meal_id_str) : null;
		states.push({
			day_id,
			meal_id,
			name: form.querySelector('.inline-meal-name')?.value || '',
			time_select: form.querySelector('.inline-meal-time')?.value || '',
			custom_time: form.querySelector('.inline-meal-time-custom')?.value || '',
			calories: form.querySelector('.inline-meal-calories')?.value || '',
			notes: form.querySelector('.inline-meal-notes')?.value || ''
		});
	});
	return states;
}

// Restore previously open inline meal forms
function restore_open_meal_forms_state(states) {
	if (!states || states.length === 0) return;
	states.forEach(state => {
		const form_html = build_inline_meal_form_html(state.day_id, state.meal_id, state);
		if (state.meal_id) {
			const meal_item = document.querySelector(`.meal-item[data-meal-id="${state.meal_id}"]`);
			if (meal_item) {
				meal_item.classList.add('inline-editing');
				meal_item.insertAdjacentHTML('afterend', form_html);
				const form_el = meal_item.nextElementSibling;
				setup_inline_meal_form_events(form_el);
			}
		} else {
			const add_btn = document.querySelector(`.add-meal-btn[data-day-id="${state.day_id}"]`);
			if (add_btn) {
				const day_actions = add_btn.closest('.day-actions');
				day_actions.insertAdjacentHTML('beforebegin', form_html);
				const form_el = day_actions.previousElementSibling;
				setup_inline_meal_form_events(form_el);
			}
		}
	});
}

// Close a specific inline meal form (or all forms if none specified)
function close_inline_meal_form(form_el = null) {
	if (!form_el) {
		const existing_forms = document.querySelectorAll('.inline-meal-form');
		existing_forms.forEach(f => close_inline_meal_form(f));
		return;
	}
	// If editing, restore the original meal item that was hidden
	const meal_id = form_el.dataset.mealId;
	if (meal_id) {
		const hidden_item = document.querySelector(`.meal-item[data-meal-id="${meal_id}"].inline-editing`);
		if (hidden_item) {
			hidden_item.classList.remove('inline-editing');
		}
	}
	form_el.remove();
}

// Wire up event listeners on an inline meal form
function setup_inline_meal_form_events(form_el) {
	const time_select = form_el.querySelector('.inline-meal-time');
	const custom_input = form_el.querySelector('.inline-meal-time-custom');
	const save_btn = form_el.querySelector('.inline-meal-save-btn');
	const cancel_btn = form_el.querySelector('.inline-meal-cancel-btn');
	const name_input = form_el.querySelector('.inline-meal-name');
	const calories_input = form_el.querySelector('.inline-meal-calories');
	const notes_input = form_el.querySelector('.inline-meal-notes');

	time_select.addEventListener('change', () => {
		custom_input.style.display = time_select.value === 'custom' ? 'block' : 'none';
		if (time_select.value === 'custom') custom_input.focus();
	});

	// Auto-resize notes textarea dynamically to fit text entered
	const auto_resize_notes = () => {
		if (!notes_input) return;
		notes_input.style.height = 'auto';
		const border_offset = notes_input.offsetHeight - notes_input.clientHeight;
		notes_input.style.height = `${notes_input.scrollHeight + border_offset}px`;
	};

	if (notes_input) {
		notes_input.addEventListener('input', auto_resize_notes);
		auto_resize_notes();
		setTimeout(auto_resize_notes, 0);
	}

	const handle_enter = (e) => {
		if (e.key === 'Enter') {
			e.preventDefault();
			save_inline_meal(form_el);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close_inline_meal_form(form_el);
		}
	};

	name_input.addEventListener('keydown', handle_enter);
	calories_input.addEventListener('keydown', handle_enter);
	time_select.addEventListener('keydown', handle_enter);
	custom_input.addEventListener('keydown', handle_enter);
	notes_input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			save_inline_meal(form_el);
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close_inline_meal_form(form_el);
		}
	});

	save_btn.addEventListener('click', () => save_inline_meal(form_el));
	cancel_btn.addEventListener('click', () => close_inline_meal_form(form_el));

	// Focus the name input
	setTimeout(() => name_input.focus(), 0);
}

// Open inline meal form (add or edit)
async function open_inline_meal_form(day_id, meal_id = null) {
	if (meal_id) {
		// If an edit form for this specific meal is already open, focus its name input
		const existing_form = document.querySelector(`.inline-meal-form[data-meal-id="${meal_id}"]`);
		if (existing_form) {
			const name_input = existing_form.querySelector('.inline-meal-name');
			if (name_input) name_input.focus();
			return;
		}

		const meal = await db.meals.get(meal_id);
		const form_html = build_inline_meal_form_html(day_id, meal_id, meal);

		// Edit mode: insert form right after the meal item, hide the meal item
		const meal_item = document.querySelector(`.meal-item[data-meal-id="${meal_id}"]`);
		if (meal_item) {
			meal_item.classList.add('inline-editing');
			meal_item.insertAdjacentHTML('afterend', form_html);
			const form_el = meal_item.nextElementSibling;
			setup_inline_meal_form_events(form_el);
		}
	} else {
		// Add mode: find the day card and insert before the day-actions
		const add_btn = document.querySelector(`.add-meal-btn[data-day-id="${day_id}"]`);
		if (add_btn) {
			const day_actions = add_btn.closest('.day-actions');
			const form_html = build_inline_meal_form_html(day_id, null, null);
			day_actions.insertAdjacentHTML('beforebegin', form_html);
			const form_el = day_actions.previousElementSibling;
			setup_inline_meal_form_events(form_el);
		}
	}
}

// Save Meal from inline form
async function save_inline_meal(form_el) {
	const day_id = parseInt(form_el.dataset.dayId);
	const meal_id_str = form_el.dataset.mealId;
	const meal_id = meal_id_str ? parseInt(meal_id_str) : null;

	const name = form_el.querySelector('.inline-meal-name').value;
	const calories = parseFloat(form_el.querySelector('.inline-meal-calories').value);
	const notes = form_el.querySelector('.inline-meal-notes').value;
	const time_select = form_el.querySelector('.inline-meal-time').value;
	const time_of_day = time_select === 'custom' ? form_el.querySelector('.inline-meal-time-custom').value : time_select;

	if (!name || !time_select || isNaN(calories)) {
		alert('Please fill in all required fields');
		return;
	}

	if (time_select === 'custom' && !time_of_day) {
		alert('Please enter a custom time');
		return;
	}

	const day = await db.days.get(day_id);
	const meal_date = day ? day.date : new Date().toISOString().split('T')[0];

	const meal_data = {
		day_id: day_id,
		name,
		time_of_day,
		calories,
		notes,
		date: meal_date,
		updated_at: new Date().toISOString()
	};

	if (meal_id) {
		// Update existing meal
		await db.meals.update(meal_id, meal_data);
	} else {
		// Add new meal
		meal_data.created_at = new Date().toISOString();
		await db.meals.add(meal_data);
	}

	// Capture any OTHER open forms before reloading the list so their edit state isn't lost
	const other_open_forms = get_open_meal_forms_state(form_el);

	if (search_active) {
		await perform_search();
	} else {
		await load_and_display_days();
	}

	// Restore any other open forms that were active
	restore_open_meal_forms_state(other_open_forms);
}

// Delete Meal
async function delete_meal(meal_id) {
	if (confirm('Are you sure you want to delete this meal?')) {
		const deleting_form = document.querySelector(`.inline-meal-form[data-meal-id="${meal_id}"]`);
		const other_open_forms = get_open_meal_forms_state(deleting_form);
		await db.meals.delete(meal_id);

		if (search_active) {
			await perform_search();
		} else {
			await load_and_display_days();
		}

		restore_open_meal_forms_state(other_open_forms);
	}
}

// Duplicate Meal
async function duplicate_meal(meal_id) {
	const other_open_forms = get_open_meal_forms_state();
	const meal = await db.meals.get(meal_id);
	if (meal) {
		const new_meal = { ...meal };
		delete new_meal.id;
		new_meal.created_at = new Date().toISOString();
		new_meal.updated_at = new Date().toISOString();
		await db.meals.add(new_meal);

		if (search_active) {
			await perform_search();
		} else {
			await load_and_display_days();
		}

		restore_open_meal_forms_state(other_open_forms);
	}
}

// Delete Day
async function delete_day(day_id) {
	if (confirm('Are you sure you want to delete this entire day? All meals will be removed.')) {
		await db.days.delete(day_id);
		await db.meals.where('day_id').equals(day_id).delete();
		load_and_display_days();
	}
}

// Duplicate Day
async function duplicate_day(day_id) {
	const day = await db.days.get(day_id);
	const meals = await db.meals.where('day_id').equals(day_id).toArray();

	if (day) {
		// Create new day with tomorrow's date
		const next_date = new Date(day.date);
		next_date.setDate(next_date.getDate() + 1);
		const new_date_string = next_date.toISOString().split('T')[0];

		// Add new day
		const new_day_id = await db.days.add({
			date: new_date_string,
			notes: day.notes || '',
			created_at: new Date().toISOString()
		});

		// Duplicate all meals from original day
		for (const meal of meals) {
			const new_meal = { ...meal };
			delete new_meal.id;
			new_meal.day_id = new_day_id;
			new_meal.date = new_date_string;
			new_meal.created_at = new Date().toISOString();
			new_meal.updated_at = new Date().toISOString();
			await db.meals.add(new_meal);
		}

		load_and_display_days();
	}
}

// Load and Display Days
async function load_and_display_days() {
	const container = document.getElementById('days_container');
	const days = await db.days.toArray();

	if (days.length === 0) {
		container.innerHTML = `
			<div class="w-100">
				<div class="empty-state">
					<i class="bi bi-calendar-event"></i>
					<p>No days logged yet. Click "Add Day" to get started!</p>
				</div>
			</div>
		`;
		return;
	}

	// Sort days in descending order (newest first)
	days.sort((a, b) => new Date(b.date) - new Date(a.date));

	container.innerHTML = '';
	for (const day of days) {
		const meals = await db.meals.where('day_id').equals(day.id).toArray();
		const day_element = create_day_element(day, meals);
		container.appendChild(day_element);
	}
}

// Create Day Element
function create_day_element(day, meals) {
	const day_div = document.createElement('div');
	day_div.className = 'w-100';

	const date_obj = new Date(day.date);
	const date_string = date_obj.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
	const total_calories = meals.reduce((sum, meal) => sum + (meal.calories || 0), 0);
	const formatted_calories = total_calories % 1 === 0 ? total_calories : total_calories.toFixed(2);

	const total_water = meals.reduce((sum, meal) => sum + (extract_water_amount(meal.name) || extract_water_amount(meal.notes || '')), 0);
	const formatted_water = format_water_amount(total_water);

	const total_salt = meals.reduce((sum, meal) => sum + (extract_salt_amount(meal.name) || extract_salt_amount(meal.notes || '')), 0);
	const formatted_salt = format_salt_amount(total_salt);

	let meals_html = '';
	if (meals.length === 0) {
		meals_html = `
			<div class="empty-state">
				<p class="small">No meals logged</p>
			</div>
		`;
	} else {
		meals_html = '<ol class="meals-list" data-day-id="' + day.id + '">';
		meals.forEach((meal, index) => {
			const time_display = get_time_display_text(meal.time_of_day);
			const meal_water = extract_water_amount(meal.name) || extract_water_amount(meal.notes || '');
			const meal_salt = extract_salt_amount(meal.name) || extract_salt_amount(meal.notes || '');

			meals_html += `
				<li class="meal-item" draggable="true" data-meal-id="${meal.id}">
					<div class="drag-handle" title="Drag to reorder">
						<i class="bi bi-grip-vertical"></i>
					</div>
					<div class="meal-number">${index + 1}</div>
					<div class="meal-details">
						<p class="meal-name">${escape_html(meal.name)}</p>
						<div class="meal-info">
							<span class="meal-info-label">Time:</span>
							<span>${escape_html(time_display)}</span>
							<span class="meal-info-label">Calories:</span>
							<span class="meal-calories">${meal.calories} kcal</span>
							${meal_water > 0 ? `
								<span class="meal-info-label">Water:</span>
								<span class="meal-water">${format_water_amount(meal_water)}</span>
							` : ''}
							${meal_salt > 0 ? `
								<span class="meal-info-label">Salt:</span>
								<span class="meal-salt">${format_salt_amount(meal_salt)}</span>
							` : ''}
						</div>
						${meal.notes ? `<div class="meal-notes">${escape_html(meal.notes)}</div>` : ''}
					</div>
					<div class="meal-actions">
						<button class="btn btn-sm btn-warning edit-meal-btn" data-meal-id="${meal.id}" title="Edit meal">
							<i class="bi bi-pencil"></i>
						</button>
						<button class="btn btn-sm btn-info copy-meal-btn" data-meal-id="${meal.id}" title="Duplicate meal">
							<i class="bi bi-files"></i>
						</button>
						<button class="btn btn-sm btn-danger delete-meal-btn" data-meal-id="${meal.id}" title="Delete meal">
							<i class="bi bi-trash"></i>
						</button>
					</div>
				</li>
			`;
		});
		meals_html += '</ol>';
	}

	const day_notes = day.notes || '';
	const notes_html = day_notes
		? `<div class="day-notes-text">${escape_html(day_notes)}</div>`
		: '';

	const card = document.createElement('div');
	card.className = 'day-card shadow-sm rounded overflow-hidden';
	card.innerHTML = `
		<div class="day-header">
			<div class="w-100">
				<h5>${date_string}</h5>
				<div class="day-totals-row">
					<div class="day-totals-summary">
						<span class="day-total-badge day-total-kcal"><strong>Total:</strong> ${formatted_calories} kcal</span>
						<span class="day-total-badge day-total-water" title="Water calculated from meal names"><strong>💧 Water:</strong> ${formatted_water}</span>
						<span class="day-total-badge day-total-salt" title="Salt calculated from meal names"><strong>🧂 Salt:</strong> ${formatted_salt}</span>
					</div>
					<button class="btn btn-sm btn-warning edit-day-notes-btn" data-day-id="${day.id}" title="${day_notes ? 'Edit day notes' : 'Add day notes'}">
						<i class="bi bi-pencil"></i>
					</button>
				</div>
				${notes_html}
			</div>
		</div>
		<div class="day-content">
			${meals_html}
			<div class="day-actions">
				<button class="btn btn-sm btn-success add-meal-btn" data-day-id="${day.id}">
					<i class="bi bi-plus-circle"></i> Add Meal
				</button>
				<button class="btn btn-sm btn-secondary edit-day-btn" data-day-id="${day.id}" data-day-date="${day.date}">
					<i class="bi bi-calendar-edit"></i> Change Date
				</button>
				<button class="btn btn-sm btn-info copy-day-btn" data-day-id="${day.id}">
					<i class="bi bi-files"></i> Duplicate Day
				</button>
				<button class="btn btn-sm btn-danger delete-day-btn" data-day-id="${day.id}">
					<i class="bi bi-trash"></i> Delete Day
				</button>
			</div>
		</div>
	`;

	day_div.appendChild(card);

	// Setup event listeners for this day element
	setTimeout(() => {
		const day_element = day_div.querySelector('.day-card');

		// Add meal button
		day_element.querySelector('.add-meal-btn')?.addEventListener('click', (e) => {
			open_inline_meal_form(parseInt(e.currentTarget.dataset.dayId));
		});

		// Edit day date button
		day_element.querySelector('.edit-day-btn')?.addEventListener('click', (e) => {
			open_edit_day_modal(
				parseInt(e.currentTarget.dataset.dayId),
				e.currentTarget.dataset.dayDate
			);
		});

		// Delete day button
		day_element.querySelector('.delete-day-btn')?.addEventListener('click', (e) => {
			delete_day(parseInt(e.currentTarget.dataset.dayId));
		});

		// Duplicate day button
		day_element.querySelector('.copy-day-btn')?.addEventListener('click', (e) => {
			duplicate_day(parseInt(e.currentTarget.dataset.dayId));
		});

		// Edit day notes button
		day_element.querySelector('.edit-day-notes-btn')?.addEventListener('click', (e) => {
			open_inline_day_notes_form(parseInt(e.currentTarget.dataset.dayId), day_notes);
		});

		// Edit meal buttons
		day_element.querySelectorAll('.edit-meal-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				open_inline_meal_form(day.id, parseInt(e.currentTarget.dataset.mealId));
			});
		});

		// Copy meal buttons
		day_element.querySelectorAll('.copy-meal-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				duplicate_meal(parseInt(e.currentTarget.dataset.mealId));
			});
		});

		// Delete meal buttons
		day_element.querySelectorAll('.delete-meal-btn').forEach(btn => {
			btn.addEventListener('click', (e) => {
				delete_meal(parseInt(e.currentTarget.dataset.mealId));
			});
		});

		// Setup drag and drop
		setup_drag_and_drop(day_element);
	}, 0);

	return day_div;
}

// Open inline day notes form
function open_inline_day_notes_form(day_id, current_notes) {
	close_inline_day_notes_form();

	const notes_btn = document.querySelector(`.edit-day-notes-btn[data-day-id="${day_id}"]`);
	if (!notes_btn) return;

	// Hide the existing notes text while editing
	const notes_text_el = notes_btn.closest('.day-header').querySelector('.day-notes-text');
	if (notes_text_el) notes_text_el.style.display = 'none';

	const form_html = `
		<div class="inline-day-notes-form" data-day-id="${day_id}">
			<div class="inline-day-notes-form-inner">
				<textarea class="form-control form-control-sm inline-day-notes-textarea" rows="2" placeholder="Add notes for this day...">${escape_html(current_notes)}</textarea>
				<div class="inline-day-notes-actions">
					<button type="button" class="btn btn-sm btn-secondary inline-day-notes-cancel-btn">Cancel</button>
					<button type="button" class="btn btn-sm btn-success inline-day-notes-save-btn">Save Day Notes</button>
				</div>
			</div>
		</div>
	`;

	const totals_row = notes_btn.closest('.day-totals-row');
	totals_row.insertAdjacentHTML('afterend', form_html);

	const form_el = totals_row.nextElementSibling;
	const textarea = form_el.querySelector('.inline-day-notes-textarea');

	// Auto-resize day notes textarea dynamically to fit text entered
	const auto_resize_day_notes = () => {
		if (!textarea) return;
		textarea.style.height = 'auto';
		const border_offset = textarea.offsetHeight - textarea.clientHeight;
		textarea.style.height = `${textarea.scrollHeight + border_offset}px`;
	};

	if (textarea) {
		textarea.addEventListener('input', auto_resize_day_notes);
		auto_resize_day_notes();
		setTimeout(auto_resize_day_notes, 0);
	}

	form_el.querySelector('.inline-day-notes-save-btn').addEventListener('click', () => save_day_notes(day_id, form_el));
	form_el.querySelector('.inline-day-notes-cancel-btn').addEventListener('click', () => close_inline_day_notes_form());
	textarea.addEventListener('keydown', (e) => {
		if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
			e.preventDefault();
			save_day_notes(day_id, form_el);
		}
		if (e.key === 'Escape') {
			e.preventDefault();
			close_inline_day_notes_form();
		}
	});

	setTimeout(() => textarea.focus(), 0);
}

// Close inline day notes form
function close_inline_day_notes_form() {
	const existing = document.querySelector('.inline-day-notes-form');
	if (existing) {
		// Restore hidden notes text if any
		const day_id = existing.dataset.dayId;
		const notes_text_el = document.querySelector(`.edit-day-notes-btn[data-day-id="${day_id}"]`)?.closest('.day-header')?.querySelector('.day-notes-text');
		if (notes_text_el) notes_text_el.style.display = '';
		existing.remove();
	}
}

// Save day notes
async function save_day_notes(day_id, form_el) {
	const other_open_forms = get_open_meal_forms_state();
	const notes = form_el.querySelector('.inline-day-notes-textarea').value.trim();
	await db.days.update(day_id, { notes });

	if (search_active) {
		await perform_search();
	} else {
		await load_and_display_days();
	}

	restore_open_meal_forms_state(other_open_forms);
}

// Setup Drag and Drop
function setup_drag_and_drop(day_element) {
	const meals_list = day_element.querySelector('.meals-list');
	if (!meals_list) return;

	const meal_items = meals_list.querySelectorAll('.meal-item');

	meal_items.forEach(item => {
		item.addEventListener('dragstart', (e) => {
			e.dataTransfer.effectAllowed = 'move';
			e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
			e.currentTarget.classList.add('dragging');
		});

		item.addEventListener('dragend', (e) => {
			e.currentTarget.classList.remove('dragging');
			meal_items.forEach(mi => mi.classList.remove('drag-over'));
		});

		item.addEventListener('dragover', (e) => {
			e.preventDefault();
			e.dataTransfer.dropEffect = 'move';
			if (e.currentTarget !== e.target.closest('.meal-item')) {
				e.currentTarget.closest('.meal-item')?.classList.add('drag-over');
			}
		});

		item.addEventListener('dragleave', (e) => {
			if (e.currentTarget === e.target.closest('.meal-item')) {
				e.currentTarget.classList.remove('drag-over');
			}
		});

		item.addEventListener('drop', async (e) => {
			e.preventDefault();
			const dragged_item = meals_list.querySelector('.dragging');
			const target_item = e.currentTarget.closest('.meal-item');

			if (dragged_item && target_item && dragged_item !== target_item) {
				const dragged_index = Array.from(meal_items).indexOf(dragged_item);
				const target_index = Array.from(meal_items).indexOf(target_item);

				// Reorder in DOM
				if (dragged_index < target_index) {
					target_item.parentNode.insertBefore(dragged_item, target_item.nextSibling);
				} else {
					target_item.parentNode.insertBefore(dragged_item, target_item);
				}

				// Update database order
				await update_meal_order(meals_list);
			}
			e.currentTarget.classList.remove('drag-over');
		});
	});
}

// Update Meal Order
async function update_meal_order(meals_list) {
	const day_id = parseInt(meals_list.dataset.dayId);
	const meal_items = meals_list.querySelectorAll('.meal-item');

	const updates = [];
	meal_items.forEach((item, index) => {
		const meal_id = parseInt(item.dataset.mealId);
		updates.push(db.meals.update(meal_id, { order: index }));
	});

	await Promise.all(updates);
}

// Search Functionality
async function perform_search() {
	const date_filter = document.getElementById('search_date').value;
	const name_filter = document.getElementById('search_meal_name').value.toLowerCase();
	const calories_filter = document.getElementById('search_calories').value;
	const notes_filter = document.getElementById('search_notes').value.toLowerCase();

	let results = await db.meals.toArray();

	// Filter by date
	if (date_filter) {
		results = results.filter(meal => meal.date === date_filter);
	}

	// Filter by meal name
	if (name_filter) {
		results = results.filter(meal => meal.name.toLowerCase().includes(name_filter));
	}

	// Filter by calories
	if (calories_filter) {
		const calories = parseFloat(calories_filter);
		results = results.filter(meal => meal.calories === calories);
	}

	// Filter by notes
	if (notes_filter) {
		results = results.filter(meal => meal.notes && meal.notes.toLowerCase().includes(notes_filter));
	}

	display_search_results(results);
	search_active = true;
}

// Display Search Results
async function display_search_results(results) {
	const container = document.getElementById('days_container');

	if (results.length === 0) {
		container.innerHTML = `
			<div class="w-100">
				<div class="no-results">
					<i class="bi bi-search"></i>
					<p>No meals found matching your search criteria.</p>
				</div>
			</div>
		`;
		return;
	}

	// Group results by day
	const grouped_by_day = {};
	for (const meal of results) {
		if (!grouped_by_day[meal.day_id]) {
			grouped_by_day[meal.day_id] = [];
		}
		grouped_by_day[meal.day_id].push(meal);
	}

	container.innerHTML = '';
	for (const day_id in grouped_by_day) {
		const day_id_num = parseInt(day_id);
		const day = await db.days.get(day_id_num);
		if (day) {
			const day_element = create_day_element(day, grouped_by_day[day_id]);
			container.appendChild(day_element);
		}
	}
}

// Clear Search
function clear_search() {
	document.getElementById('search_date').value = '';
	document.getElementById('search_meal_name').value = '';
	document.getElementById('search_calories').value = '';
	document.getElementById('search_notes').value = '';
	search_active = false;
	load_and_display_days();
}

// Utility Functions
function get_time_display_text(time_of_day) {
	const time_map = {
		'overnight': '🌙 Overnight',
		'morning': '🌅 Morning',
		'beforeNoon': '🌄 Before Noon',
		'afternoon': '☀️ Afternoon',
		'evening': '🌆 Evening',
		'night': '🌃 Night'
	};
	return time_map[time_of_day] || time_of_day;
}

function escape_html(text) {
	const map = {
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;'
	};
	return text.replace(/[&<>"']/g, m => map[m]);
}

// Water and Salt Extraction and Formatting Utilities

function parse_fraction_or_float(val_str) {
	if (!val_str) return 0;
	val_str = String(val_str).trim().replace(',', '.');
	if (val_str.includes('/')) {
		const parts = val_str.split('/');
		if (parts.length === 2) {
			const num = parseFloat(parts[0]);
			const den = parseFloat(parts[1]);
			if (!isNaN(num) && !isNaN(den) && den !== 0) {
				return num / den;
			}
		}
	}
	const num = parseFloat(val_str);
	return isNaN(num) ? 0 : num;
}

function convert_water_unit_to_ml(amount, unit) {
	if (isNaN(amount) || amount <= 0) return 0;
	if (!unit) {
		// Heuristic: "water 500" -> 500ml; "water 1.5" -> 1500ml; "water 2" -> 2000ml; "water 0.5" -> 500ml
		if (amount <= 10) {
			return amount * 1000;
		}
		return amount;
	}
	const u = unit.toLowerCase().replace(/[\s.]/g, '');
	if (['l', 'liter', 'liters', 'litre', 'litres', 'lt'].includes(u)) {
		return amount * 1000;
	}
	if (['dl', 'deciliter', 'deciliters', 'decilitre', 'decilitres'].includes(u)) {
		return amount * 100;
	}
	if (['cl', 'centiliter', 'centiliters', 'centilitre', 'centilitres'].includes(u)) {
		return amount * 10;
	}
	if (['ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres', 'm'].includes(u)) {
		return amount;
	}
	if (['g', 'gram', 'grams', 'gr'].includes(u)) {
		return amount; // 1g water = 1ml
	}
	if (['kg', 'kilogram', 'kilograms'].includes(u)) {
		return amount * 1000;
	}
	if (['oz', 'floz', 'fl'].includes(u)) {
		return amount * 29.5735;
	}
	if (['cup', 'cups'].includes(u)) {
		return amount * 240;
	}
	if (['glass', 'glasses'].includes(u)) {
		return amount * 250;
	}
	if (['bottle', 'bottles'].includes(u)) {
		return amount * 500;
	}
	if (['pt', 'pint', 'pints'].includes(u)) {
		return amount * 473.176;
	}
	if (['qt', 'quart', 'quarts'].includes(u)) {
		return amount * 946.353;
	}
	if (['gal', 'gallon', 'gallons'].includes(u)) {
		return amount * 3785.41;
	}
	return amount;
}

function convert_salt_unit_to_g(amount, unit) {
	if (isNaN(amount) || amount <= 0) return 0;
	if (!unit) {
		// Heuristic: "salt 2" -> 2g; "salt 500" -> 500mg = 0.5g
		if (amount > 50) {
			return amount / 1000;
		}
		return amount;
	}
	const u = unit.toLowerCase().replace(/[\s.]/g, '');
	if (['g', 'gram', 'grams', 'gr'].includes(u)) {
		return amount;
	}
	if (['mg', 'milligram', 'milligrams'].includes(u)) {
		return amount / 1000;
	}
	if (['kg', 'kilogram', 'kilograms'].includes(u)) {
		return amount * 1000;
	}
	if (['tsp', 'teaspoon', 'teaspoons'].includes(u)) {
		return amount * 5.69;
	}
	if (['tbsp', 'tablespoon', 'tablespoons'].includes(u)) {
		return amount * 17.07;
	}
	if (['pinch', 'pinches'].includes(u)) {
		return amount * 0.4;
	}
	return amount;
}

function extract_water_amount(text) {
	if (!text || typeof text !== 'string') return 0;

	let total_ml = 0;
	const matched_ranges = [];

	function is_overlapping(start, end) {
		return matched_ranges.some(r => Math.max(start, r.start) < Math.min(end, r.end));
	}

	const sep = '(?:[:\\-–—=~;]|,(?!\\d))?';
	const water_kw = '(?:(?:mineral|sparkling|tap|drinking|warm|cold|hot|lemon|bottled|filtered|spring|still)\\s+)?(?:water|h2o)\\b';
	const units = '(?:ml|milliliters?|millilitres?|l|liters?|litres?|cl|dl|fl\\.?\\s*oz|floz|oz|cups?|glasses?|bottles?|g|grams?|kg|pt|pints?|qt|quarts?|gal|gallons?)';
	const num = '(?:\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[.,]\\d+)';

	// Pattern 1: Multiplier + number + unit? + water keyword (e.g. "2x 500ml water", "2 * 500ml water")
	const p0 = new RegExp(`(\\d+)\\s*[x*×]\\s*(${num})\\s*(${units})?\\s*(?:of\\s+)?\\b(${water_kw})`, 'gi');
	let m;
	while ((m = p0.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const count = parseInt(m[1], 10) || 1;
			const val = parse_fraction_or_float(m[2]);
			const unit = m[3] || '';
			total_ml += count * convert_water_unit_to_ml(val, unit);
		}
	}

	// Pattern 2: Water keyword + multiplier + number + unit? (e.g. "water 2x 500ml", "water: 2 * 500ml")
	const p0b = new RegExp(`\\b(${water_kw})\\s*${sep}\\s*[\\(\\[]?\\s*(\\d+)\\s*[x*×]\\s*(${num})\\s*(${units})?[\\)\\]]?`, 'gi');
	while ((m = p0b.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const count = parseInt(m[2], 10) || 1;
			const val = parse_fraction_or_float(m[3]);
			const unit = m[4] || '';
			total_ml += count * convert_water_unit_to_ml(val, unit);
		}
	}

	// Pattern 3: Water keyword + optional punctuation + number + optional unit
	// e.g. "water: 500ml", "water, 1.5 L", "water (500ml)", "water 500", "mineral water 1L"
	const p1 = new RegExp(`\\b(${water_kw})\\s*${sep}\\s*[\\(\\[]?\\s*(${num})\\s*(${units})?[\\)\\]]?`, 'gi');
	while ((m = p1.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const val = parse_fraction_or_float(m[2]);
			const unit = m[3] || '';
			total_ml += convert_water_unit_to_ml(val, unit);
		}
	}

	// Pattern 4: Number + unit + optional "of" + water keyword
	// e.g. "500ml water", "1.5 l of water", "2 cups water", "16 oz water"
	const p2 = new RegExp(`(${num})\\s*(${units})?\\s*(?:of\\s+)?\\b(${water_kw})`, 'gi');
	while ((m = p2.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const val = parse_fraction_or_float(m[1]);
			const unit = m[2] || '';
			total_ml += convert_water_unit_to_ml(val, unit);
		}
	}

	return total_ml;
}

function extract_salt_amount(text) {
	if (!text || typeof text !== 'string') return 0;

	let total_g = 0;
	const matched_ranges = [];

	function is_overlapping(start, end) {
		return matched_ranges.some(r => Math.max(start, r.start) < Math.min(end, r.end));
	}

	const sep = '(?:[:\\-–—=~;]|,(?!\\d))?';
	const salt_kw = '(?:(?:sea|table|himalayan|rock|celtic|kosher|iodized|fine|coarse|cooking)\\s+)?salt\\b';
	const units = '(?:g|grams?|gr|mg|milligrams?|kg|tsp|teaspoons?|tbsp|tablespoons?|pinch|pinches)';
	const num = '(?:\\d+\\/\\d+|\\d+(?:[.,]\\d+)?|[.,]\\d+)';

	// Pattern 1: Multiplier + number + unit? + salt keyword (e.g. "2x 1g salt")
	const p0 = new RegExp(`(\\d+)\\s*[x*×]\\s*(${num})\\s*(${units})?\\s*(?:of\\s+)?\\b(${salt_kw})`, 'gi');
	let m;
	while ((m = p0.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const count = parseInt(m[1], 10) || 1;
			const val = parse_fraction_or_float(m[2]);
			const unit = m[3] || '';
			total_g += count * convert_salt_unit_to_g(val, unit);
		}
	}

	// Pattern 2: Salt keyword + multiplier + number + unit?
	const p0b = new RegExp(`\\b(${salt_kw})\\s*${sep}\\s*[\\(\\[]?\\s*(\\d+)\\s*[x*×]\\s*(${num})\\s*(${units})?[\\)\\]]?`, 'gi');
	while ((m = p0b.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const count = parseInt(m[2], 10) || 1;
			const val = parse_fraction_or_float(m[3]);
			const unit = m[4] || '';
			total_g += count * convert_salt_unit_to_g(val, unit);
		}
	}

	// Pattern 3: Salt keyword + optional punctuation + number + optional unit
	// e.g. "salt: 2g", "salt, 0.3g", "salt 500mg", "salt (1g)", "salt 2", "sea salt 1.5g", "salt .3"
	const p1 = new RegExp(`\\b(${salt_kw})\\s*${sep}\\s*[\\(\\[]?\\s*(${num})\\s*(${units})?[\\)\\]]?`, 'gi');
	while ((m = p1.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const val = parse_fraction_or_float(m[2]);
			const unit = m[3] || '';
			total_g += convert_salt_unit_to_g(val, unit);
		}
	}

	// Pattern 4: Number + unit + optional "of" + salt keyword
	// e.g. "2g salt", "0.3g salt", "500mg of salt", "1 tsp salt", "1/2 tsp sea salt", "1 pinch salt"
	const p2 = new RegExp(`(${num})\\s*(${units})?\\s*(?:of\\s+)?\\b(${salt_kw})`, 'gi');
	while ((m = p2.exec(text)) !== null) {
		const start = m.index;
		const end = start + m[0].length;
		if (!is_overlapping(start, end)) {
			matched_ranges.push({ start, end });
			const val = parse_fraction_or_float(m[1]);
			const unit = m[2] || '';
			total_g += convert_salt_unit_to_g(val, unit);
		}
	}

	return total_g;
}

function format_water_amount(ml) {
	if (!ml || isNaN(ml) || ml <= 0) return '0 ml';
	const rounded_ml = Math.round(ml * 10) / 10;
	if (rounded_ml >= 1000) {
		const liters = rounded_ml / 1000;
		const formatted_liters = liters % 1 === 0 ? liters.toString() : liters.toFixed(2).replace(/\.?0+$/, '');
		const formatted_ml = rounded_ml % 1 === 0 ? rounded_ml.toLocaleString('en-US') : rounded_ml.toFixed(1);
		return `${formatted_ml} ml (${formatted_liters} L)`;
	}
	const formatted_ml = rounded_ml % 1 === 0 ? rounded_ml.toString() : rounded_ml.toFixed(1);
	return `${formatted_ml} ml`;
}

function format_salt_amount(g) {
	if (!g || isNaN(g) || g <= 0) return '0 g';
	const rounded_g = Math.round(g * 100) / 100;
	if (rounded_g === 0 && g > 0) {
		const small_g = Math.round(g * 1000) / 1000;
		return `${small_g} g`;
	}
	const formatted_g = rounded_g % 1 === 0 ? rounded_g.toString() : rounded_g.toFixed(2).replace(/\.?0+$/, '');
	return `${formatted_g} g`;
}