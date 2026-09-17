# HTML Forms: The Beginner's Mental Model

HTML forms become much easier when you stop thinking about them as a collection of boxes and start thinking about them as **structured user input**.

## 1. The form is the container

The `<form>` element groups controls that belong to one submission.

```html
<form action="/submit" method="post">
  <!-- controls -->
</form>
```

The `action` describes where data goes, while `method` describes how it is sent.

## 2. Labels are part of the interface

A label should clearly describe its control. Connecting them with `for` and `id` improves usability and accessibility.

```html
<label for="email">Email</label>
<input id="email" name="email" type="email">
```

The `name` attribute identifies the submitted field.

## 3. Choose the input type deliberately

HTML already provides useful controls such as `email`, `date`, `password`, `number`, `radio` and `checkbox`.

Using the appropriate type gives browsers more information and can improve validation and mobile keyboard behavior.

## 4. Group related choices

Use `<fieldset>` and `<legend>` when several controls form one logical group. That is especially useful for radio buttons and related options.

## 5. Practice challenge

Open the **Student Registration Form** class in the lab and improve it.

Try adding:

- A phone number field
- A country selector
- A short biography textarea
- A file upload control
- Better focus and hover states

### Mentor rule

Do not rush into JavaScript. First become extremely comfortable with what HTML and CSS can already do.
